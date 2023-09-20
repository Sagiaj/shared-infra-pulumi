import * as aws from "@pulumi/aws";
import { mainAvailabilityZone, mainPublicSubnet } from "./subnet";

export function createPublicNatGateway(name: string, subnet: aws.ec2.Subnet, eip: aws.ec2.Eip, availabilityZone: string) {
    return new aws.ec2.NatGateway(`natgw-${name}-${availabilityZone}`, {
        subnetId: subnet.id,
        connectivityType: "public",
        allocationId: eip.allocationId
    }, { dependsOn: [subnet, eip] });
}

export const mainPubSnNatGwEIP = new aws.ec2.Eip(`natgw-eip-main-public`, {
    vpc: true
});

export const mainNatGw = createPublicNatGateway(`main`, mainPublicSubnet, mainPubSnNatGwEIP, mainAvailabilityZone);
