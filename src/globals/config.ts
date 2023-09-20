import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export const config = new pulumi.Config();

export const accessTokens = {
    githubFrontApp: pulumi.output(aws.ssm.getParameter({
        name: "/prod/arti/app/front/access-token"
    }))
}

export const BackendDomainName = config.require("arti_domain");
export const FrontDomainName = config.require("arti_domain_front");
export const FrontSubDomain = config.require("arti_domain_front_subdomain");
