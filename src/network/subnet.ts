import * as aws from "@pulumi/aws";
import { mainVPC } from "./vpc";

export class SubnetGenerator {
    private vpc: aws.ec2.Vpc;
    private purpose: string = "main";

    constructor(vpc: aws.ec2.Vpc, purpose: string) {
        this.vpc = vpc;
        this.purpose = purpose || this.purpose;
    }

    createPrivateSubnet(availabilityZone: string, cidr: string) {
        return new aws.ec2.Subnet(`subnet-${this.purpose}-${availabilityZone}-${cidr}-private`, {
            vpcId: this.vpc.id,
            cidrBlock: cidr,
            availabilityZone
        }, { dependsOn: this.vpc });
    }

    createPublicSubnet(availabilityZone: string, cidr: string) {
        return new aws.ec2.Subnet(`subnet-${this.purpose}-${availabilityZone}-${cidr}-public`, {
            mapPublicIpOnLaunch: true,
            vpcId: this.vpc.id,
            cidrBlock: cidr,
            availabilityZone
        }, { dependsOn: this.vpc });
    }
}

const mainPrivateSubnetCidr = "10.0.1.0/24";
const mainPublicSubnetCidr = "10.0.2.0/24";
const mainSubnetGenEuCen1a = new SubnetGenerator(mainVPC, "main");

export const mainAvailabilityZone = "eu-central-1a";
export const mainPrivateSubnet = mainSubnetGenEuCen1a.createPrivateSubnet(mainAvailabilityZone, mainPrivateSubnetCidr);
export const mainPublicSubnet = mainSubnetGenEuCen1a.createPublicSubnet(mainAvailabilityZone, mainPublicSubnetCidr);
