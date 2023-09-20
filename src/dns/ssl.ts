import * as aws from "@pulumi/aws";
import { Certificate, CertificateValidation } from "@pulumi/aws/acm";

export class ACMSSLCertificate {
    private domainName: string = "";
    certificate: Certificate;
    validation: CertificateValidation;

    constructor(domainName: string, zone: aws.route53.Zone, region: aws.Region, provider?: aws.Provider) {
        this.domainName = domainName;
        this.certificate = this.createACMCertificate(region, provider);
        this.validation = this.validateCertificate(this.certificate, zone, provider);
    }

    createACMCertificate(region: aws.Region, provider?: aws.Provider) {
        this.certificate = new aws.acm.Certificate(`${this.domainName}-certificate`, {
            domainName: this.domainName,
            validationMethod: "DNS"
        }, { provider });

        return this.certificate;
    }

    validateCertificate(certificate: aws.acm.Certificate, zone: aws.route53.Zone, provider?: aws.Provider) {
        const options: any = {};
        if (provider) {
            options["provider"] = provider;
        }
        const validationRecord = new aws.route53.Record(`${this.domainName}-validation-record`, {
            name: certificate.domainValidationOptions[0].resourceRecordName,
            type: certificate.domainValidationOptions[0].resourceRecordType,
            ttl: 300,
            records: [certificate.domainValidationOptions[0].resourceRecordValue],
            zoneId: zone.zoneId
        }, { dependsOn: [certificate], ...options });

        this.validation = new aws.acm.CertificateValidation(`${this.domainName}-certificateValidation`, {
            certificateArn: certificate.arn,
            validationRecordFqdns: [validationRecord.fqdn],
        }, { dependsOn: [validationRecord], ...options });


        return this.validation;
    }
}
