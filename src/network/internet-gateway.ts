import * as aws from "@pulumi/aws";
import { mainVPC } from "./vpc";

export const mainIGW = new aws.ec2.InternetGateway(`main-vpc-igw`);
export const mainIGWA = new aws.ec2.InternetGatewayAttachment(`main-vpc-igwa`, {
    internetGatewayId: mainIGW.id,
    vpcId: mainVPC.id
}, { dependsOn: [mainIGW, mainVPC] });