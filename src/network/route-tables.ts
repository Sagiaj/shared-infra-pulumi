import * as pulumi from "@pulumi/pulumi";
import { mainIGW } from './internet-gateway';
import { mainNatGw } from './nat-gateway';
import { mainPrivateSubnet, mainPublicSubnet } from './subnet';
import { mainVPC } from './vpc';
import * as aws from "@pulumi/aws";


export class RouteTableResource {
    private vpcId: pulumi.Output<string>;
    private purpose: string;

    constructor(vpc: aws.ec2.Vpc, purpose: string) {
        this.vpcId = vpc.id;
        this.purpose = purpose;
    }

    createRouteTable(routes: aws.types.input.ec2.RouteTableRoute[]): aws.ec2.RouteTable {
        const routeTableName = this.getRouteTableName();
        
        return new aws.ec2.RouteTable(routeTableName, {
            vpcId: this.vpcId,
            routes: routes
            // ... other configurations as needed
        });
    }

    associateWithSubnet(routeTable: aws.ec2.RouteTable, subnet: aws.ec2.Subnet, suffix: string): aws.ec2.RouteTableAssociation {
        const associationName = this.getAssociationName(suffix);
        return new aws.ec2.RouteTableAssociation(associationName, {
            routeTableId: routeTable.id,
            subnetId: subnet.id
        });
    }

    associateWithSubnets(routeTable: aws.ec2.RouteTable, subnets: aws.ec2.Subnet[]): aws.ec2.RouteTableAssociation[] {
        return subnets.map((subnet, idx) => {
            return this.associateWithSubnet(routeTable, subnet, `${idx+1}`);
        });
    }

    private getRouteTableName(): string {
        return `rt-${this.purpose}`;
    }

    private getAssociationName(suffix: string): string {
        return `rta-${this.purpose}-${suffix}`;
    }
}

const mainRouteTableManager = new RouteTableResource(mainVPC, "main");

export const prvNatGwRouteTable = mainRouteTableManager.createRouteTable([
    { cidrBlock: "0.0.0.0/0", natGatewayId: mainNatGw.id }
]);

const pubRouteTable = mainRouteTableManager.createRouteTable([
    { cidrBlock: "0.0.0.0/0", gatewayId: mainIGW.id }
]);

export const mainPubRouteTableAssociations = mainRouteTableManager.associateWithSubnets(pubRouteTable, [mainPublicSubnet]);
export const mainPrivRouteTableAssociations = mainRouteTableManager.associateWithSubnets(prvNatGwRouteTable, [mainPrivateSubnet]);
