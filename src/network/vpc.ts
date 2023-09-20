import * as aws from "@pulumi/aws";
import { config } from "../globals/config";

export class VPC {
    private region: string;

    constructor(region: aws.Region) {
        this.region = region;
    }

    createVPC(cidr: string) {
        return new aws.ec2.Vpc(`vpc-${cidr}`, {
            cidrBlock: cidr
        });
    }
}


// Constants
export const defaultVPCCidrBlock = "172.31.0.0/16";
export const mainVPCCidrBlock = "10.0.0.0/16";

// Resources
export const mainVPC = new VPC(aws.Region.EUCentral1).createVPC(mainVPCCidrBlock);
