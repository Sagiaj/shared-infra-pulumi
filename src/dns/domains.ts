import * as aws from "@pulumi/aws";
import { HostedZone } from "./zone";

export class DNS {
    zone: aws.route53.Zone;

    constructor(hostedZone: aws.route53.Zone) {
        this.zone = hostedZone;
    }

    updateDomainNameServers(domainName: string) {
        return new aws.route53domains.RegisteredDomain(`registered-domain-${domainName}`, {
            domainName,
            nameServers: this.zone.nameServers.apply(a => a.map(s => ({ name: s })))
        }, { dependsOn: this.zone });
    }
}
