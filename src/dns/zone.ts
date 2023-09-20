import * as aws from "@pulumi/aws";

export class HostedZone {
    private domainName: string = "";

    constructor(domainName: string) {
        this.domainName = domainName;
    }

    create() {
        return new aws.route53.Zone(`${this.domainName}-zone`, {
            name: this.domainName
        });
    }
}

