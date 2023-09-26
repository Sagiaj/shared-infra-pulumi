import * as aws from "@pulumi/aws";
import { Certificate, CertificateValidation } from "@pulumi/aws/acm";

export class ACMSSLCertificate {
    private domainName: string = "";
    certificate: Certificate;
    validation: CertificateValidation;
    region: aws.Region;

    constructor(domainName: string, zone: aws.route53.Zone, region: aws.Region, provider?: aws.Provider) {
        this.domainName = domainName;
        this.region = region;
        this.certificate = this.createACMCertificate(provider);
        this.validation = this.validateCertificate(this.certificate, zone, provider);
    }

    createACMCertificate(provider?: aws.Provider) {
        this.certificate = new aws.acm.Certificate(`${this.domainName}-${this.region}-certificate`, {
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
        const validationRecord = new aws.route53.Record(`${this.domainName}-${this.region}-validation-record`, {
            name: certificate.domainValidationOptions[0].resourceRecordName,
            type: certificate.domainValidationOptions[0].resourceRecordType,
            ttl: 300,
            records: [certificate.domainValidationOptions[0].resourceRecordValue],
            zoneId: zone.zoneId
        }, { dependsOn: [certificate], ...options });

        this.validation = new aws.acm.CertificateValidation(`${this.domainName}-${this.region}-certificate-validation`, {
            certificateArn: certificate.arn,
            validationRecordFqdns: [validationRecord.fqdn],
        }, { dependsOn: [validationRecord], ...options });


        return this.validation;
    }
}
