import { defaultVPCCidrBlock, mainVPC, mainVPCCidrBlock } from './vpc';
import * as aws from "@pulumi/aws";

export const defaultEgress = [
    {
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
        fromPort: 0,
        toPort: 0
    }
];

export const mainSecurityGroup = new aws.ec2.SecurityGroup("main-sg-tcp-all-specific-vpcs", {
    vpcId: mainVPC.id,
    ingress: [{
        protocol: "tcp",
        fromPort: 0,
        toPort: 65535,
        cidrBlocks: [mainVPC.cidrBlock, defaultVPCCidrBlock, mainVPCCidrBlock]
    }],
    egress: defaultEgress
}, { dependsOn: [mainVPC] });

export const mainRedisAllowAllSG = new aws.ec2.SecurityGroup("main-redis-sg", {
    vpcId: mainVPC.id,
    description: "Redis security group",
    ingress: [
        {
            protocol: "tcp",
            fromPort: 6379,
            toPort: 6379,
            cidrBlocks: [/*"0.0.0.0/0", */mainVPC.cidrBlock]
        }
    ],
    egress: defaultEgress
});


