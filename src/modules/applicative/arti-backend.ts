import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { config } from "../../globals/config";
import { GetValue } from "../../utils/pulumi-utilities";

export class ApplicativeArtiBackend {
    private BaseResourceName = "arti-back";
    private SubDomain = "back";
    private StreamsSubDomain = "streams";
    private DomainName = config.require("arti_domain");
    private FrontDomainName = config.require("arti_domain_front");
    private FrontSubDomain = config.require("arti_domain_front_subdomain");

    async create() {
        const usEast1Provider = new aws.Provider(`aws-provider-${aws.Region.USEast1}`, { region: aws.Region.USEast1, profile: "personal_sagi" })
        const sslCertificate = this.createACMCertificate(aws.Region.EUCentral1);
        // const sslCertificateUsEast1 = this.createACMCertificate(aws.Region.USEast1);
        const zone = this.createHostedZone();
        this.updateRegisteredDomainNameServers(zone);
        const sslCertificateValidation = this.validateCertificate(sslCertificate, zone, this.DomainName);

        const role = this.createLambdaRole();
        const { backendLambda, streamingLambda } = await this.createLambdaFunctions(role);
        this.createLambdaRolePoliciesAttachments(role);

        // back.artithewriter.com
        const sslSubdomainCertificate = this.createACMSubdomainCertificate(this.SubDomain);
        const sslSubdomainCertificateValidation = this.validateCertificate(sslSubdomainCertificate, zone, `${this.SubDomain}.${this.DomainName}`);
        const apiGatewayDomainName = this.createDomainName(sslSubdomainCertificate, sslSubdomainCertificateValidation);
        const apiGateway = this.createAPIGateway(backendLambda, apiGatewayDomainName);
        this.createLambdaApiGatewayInvokePermission(backendLambda, apiGateway);
        this.addIntraInvocationPermissionsToLambdaRole([backendLambda, streamingLambda], role);

        // streams.artithewriter.com
        const sslStreamsSubdomainCertificateUsEast1 = await this.createCloudFrontACMCertificate(this.StreamsSubDomain, usEast1Provider);
        const sslStreamsSubdomainCertificateValidationUsEast1 = await this.validateCertificate(sslStreamsSubdomainCertificateUsEast1, zone, `${this.StreamsSubDomain}.${this.DomainName}-us-east-1`, usEast1Provider)

        const lambdaFunctionUrl = this.createStreamsLambdaFunctionUrl(streamingLambda, sslStreamsSubdomainCertificateValidationUsEast1);
        const cloudFrontDistribution = await this.createCloudFrontDistribution(lambdaFunctionUrl, sslStreamsSubdomainCertificateValidationUsEast1);
        // Create lambda invoke permissions from cloudfront to lambda url

        const records = this.createDNSRecords(zone, apiGatewayDomainName, cloudFrontDistribution);

        return { records }
    }

    async createCloudFrontACMCertificate(subdomain: string, provider?: aws.Provider) {
        const region = aws.Region.USEast1;
        const options: any = {};
        if (provider) {
            options["provider"] = provider;
        }

        const certificate = new aws.acm.Certificate(`${this.BaseResourceName}-${subdomain}.${this.DomainName}-${region}-certificate`, {
            domainName: `${subdomain}.${this.DomainName}`,
            validationMethod: "DNS"
        }, options);
        
        return certificate;
    }

    createStreamsLambdaFunctionUrl(lambda: aws.lambda.Function, validation: aws.acm.CertificateValidation) {
        const streamingUrl = new aws.lambda.FunctionUrl(`${this.BaseResourceName}-streams=lambda-function-url`, {
            invokeMode: "RESPONSE_STREAM",
            cors: {
                allowCredentials: true,
                allowOrigins: [`https://${this.FrontSubDomain}.${this.DomainName}`],
                allowHeaders: ["content-type", "keep-alive", "date"],
                allowMethods: ["*"],
                exposeHeaders: ["access-control-allow-origin", "keep-alive", "date"]
            },
            authorizationType: "NONE",
            functionName: lambda.arn
        }, { dependsOn: [lambda, validation] })
           

        return streamingUrl;
    }


    async createCloudFrontDistribution(lambdaFunctionUrl: aws.lambda.FunctionUrl, sslCertificateValidation: aws.acm.CertificateValidation) {
        const originId = "StreamingLambdaFunctionOrigin";
        const cachePolicyId = (await GetValue(aws.cloudfront.getCachePolicyOutput({ name: "Managed-CachingDisabled" }))).id;
        const originRequestPolicyId = (await GetValue(aws.cloudfront.getOriginRequestPolicyOutput({ name: "Managed-AllViewerExceptHostHeader" }))).id;
        // const responseHeadersPolicyId = (await GetValue(aws.cloudfront.getResponseHeadersPolicyOutput({ name: "Managed-CORS-with-preflight-and-SecurityHeadersPolicy" }))).id;
        const responseHeadersPolicyId = (await GetValue(aws.cloudfront.getResponseHeadersPolicyOutput({ name: "Temp-Streams-CORS-Preflight-Security-Headers" }))).id;

        const cloudFrontDistribution = new aws.cloudfront.Distribution(`${this.BaseResourceName}-cloudfront-distribution`, {
            enabled: true,
            // defaultRootObject: "index.html",
            origins: [{
                domainName: lambdaFunctionUrl.functionUrl.apply(
                    (url) => new URL(url).hostname
                  ),
                // (await GetValue(lambdaFunctionUrl.functionUrl)).replace('https\:\/\/', '').replace('/', ''),
                originId: originId,
                customOriginConfig: {
                    httpPort: 80,
                    httpsPort: 443,
                    originProtocolPolicy: "https-only",
                    originSslProtocols: ["TLSv1", "SSLv3", "TLSv1.1", "TLSv1.2"],
                },
            }],
            defaultCacheBehavior: {
                cachePolicyId: cachePolicyId,
                originRequestPolicyId: originRequestPolicyId,
                responseHeadersPolicyId: responseHeadersPolicyId,
                allowedMethods: ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
                cachedMethods: ["OPTIONS", "GET", "HEAD"],
                targetOriginId: originId,
                // forwardedValues: {
                //     headers: ["Origin"],
                //     queryString: false,
                //     cookies: {
                //         forward: "all",
                //     },
                // },
                viewerProtocolPolicy: "redirect-to-https",
                // minTtl: 0,
                // defaultTtl: 3600,
                // maxTtl: 86400,
            },
            viewerCertificate: {
                acmCertificateArn: sslCertificateValidation.certificateArn,
                sslSupportMethod: "sni-only",
                minimumProtocolVersion: "TLSv1.2_2021"
            },
            restrictions: {
                geoRestriction: {
                    restrictionType: "none",
                },
            },
            aliases: [`${this.StreamsSubDomain}.${this.DomainName}`]
        }, { dependsOn: [lambdaFunctionUrl, sslCertificateValidation] });

        return cloudFrontDistribution;
    }

    async updateRegisteredDomainNameServers(zone: aws.route53.Zone) {
        const ns = await GetValue(zone.nameServers);
        new aws.route53domains.RegisteredDomain(`${this.BaseResourceName}-registered-domain-${this.DomainName}`, {
            domainName: this.DomainName,
            nameServers: <any>ns.map(a => ({ name: a }))
        }, { dependsOn: zone });
    }

    createAPIGateway(lambda: aws.lambda.Function, domainName: aws.apigatewayv2.DomainName) {
        const artiBackApiGateway = new aws.apigatewayv2.Api(`${this.BaseResourceName}-api`, {
            protocolType: "HTTP",
            target: lambda.invokeArn,
            routeKey: "ANY /{proxy+}",
            corsConfiguration: {
                allowOrigins: [`https://${this.FrontSubDomain}.${this.FrontDomainName}`, "https://app.artithewriter.com"],
                allowCredentials: true,
                exposeHeaders: ["*"],
                allowHeaders: ["content-type", "access-control-allow-headers", "access-control-allow-origin"],
                allowMethods: ["GET", "POST", "PUT", "OPTIONS", "DELETE"]
            }
        }, { dependsOn: [domainName, lambda] });

        new aws.apigatewayv2.ApiMapping(
            `${this.BaseResourceName}-api-mapping`,
            {
                apiId: artiBackApiGateway.id,
                domainName: domainName.domainName,
                stage: "$default"
            }, { dependsOn: artiBackApiGateway }
        );

        return artiBackApiGateway;
    }

    validateCertificate(certificate: aws.acm.Certificate, zone: aws.route53.Zone, domain_name: string, provider?: aws.Provider) {
        const options: any = {};
        if (provider) {
            options["provider"] = provider;
        }
        const validationRecord = new aws.route53.Record(`${this.BaseResourceName}-${domain_name}-validation-record`, {
            name: certificate.domainValidationOptions[0].resourceRecordName,
            type: certificate.domainValidationOptions[0].resourceRecordType,
            ttl: 300,
            records: [certificate.domainValidationOptions[0].resourceRecordValue],
            zoneId: zone.zoneId
        }, { dependsOn: [certificate], ...options });

        const certificateValidation = new aws.acm.CertificateValidation(`${this.BaseResourceName}-${domain_name}-certificateValidation`, {
            certificateArn: certificate.arn,
            validationRecordFqdns: [validationRecord.fqdn],
        }, { dependsOn: [validationRecord], ...options });

        return certificateValidation;
    }

    createACMSubdomainCertificate(subdomain: string) {
        return new aws.acm.Certificate(`${this.BaseResourceName}-${subdomain}.${this.DomainName}-certificate`, {
            domainName: `${subdomain}.${this.DomainName}`,
            validationMethod: "DNS"
        });
    }
    
    createACMCertificate(region: aws.Region) {
        const regionalProvider = new aws.Provider(`aws-provider-${region}`, { region, profile: "personal_sagi" });
        const certificate = new aws.acm.Certificate(`${this.BaseResourceName}-${this.DomainName}-certificate`, {
            domainName: this.DomainName,
            validationMethod: "DNS"
        });
        
        return certificate;
    }

    createDomainName(certificate: aws.acm.Certificate, sslCertificateValidation: aws.acm.CertificateValidation) {
        return new aws.apigatewayv2.DomainName(`${this.BaseResourceName}-api-gateway-domain-name`, {
            domainName: `${this.SubDomain}.${this.DomainName}`,
            domainNameConfiguration: {
                certificateArn: certificate.arn,
                endpointType: "REGIONAL",
                securityPolicy: "TLS_1_2",
            },
        }, { dependsOn: [certificate, sslCertificateValidation] });
    }

    createLambdaApiGatewayInvokePermission(lambda: aws.lambda.Function, apiGateway: aws.apigatewayv2.Api) {
        return new aws.lambda.Permission("invoke-api-permission", {
            action: "lambda:InvokeFunction",
            function: lambda,
            principal: "apigateway.amazonaws.com",
            sourceArn: pulumi.interpolate`${apiGateway.executionArn}/*/*`,
        });
    }

    addIntraInvocationPermissionsToLambdaRole(lambdas: aws.lambda.Function[], role: aws.iam.Role) {
        return new aws.iam.RolePolicy(`${this.BaseResourceName}-AWSLambdaArtiBackendRole-invoke-lambda-role-policy`, {
            role,
            policy: pulumi.all(lambdas.map(l => l.arn)).apply(([functionArn]) => JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Action: "lambda:InvokeFunction",
                    Resource: functionArn,
                    Effect: "Allow",
                }],
            }))
        });
    }

    createLambdaRolePoliciesAttachments(role: aws.iam.Role) {
        return [
            new aws.iam.RolePolicyAttachment(`${this.BaseResourceName}-AWSLambdaArtiBackendRole-policy`, {
                policyArn: `arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`,
                role: role
            }, { dependsOn: [role] }),
            new aws.iam.RolePolicyAttachment(`${this.BaseResourceName}-AWSLambdaArtiBackendRole-vpc-policy`, {
                policyArn: `arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole`,
                role: role
            }, { dependsOn: [role] }),
            new aws.iam.RolePolicyAttachment(`${this.BaseResourceName}-AWSLambdaArtiBackendRole-secrets-policy`, {
                policyArn: `arn:aws:iam::aws:policy/SecretsManagerReadWrite`,
                role: role
            }, { dependsOn: [role] })
        ];
    }

    createApplicativeVPC(cidr: string) {
        return new aws.ec2.Vpc(`arti-vpc-${cidr}`, {
            cidrBlock: cidr
        });
    }

    createPrivateSubnet(cidr: string, vpc: aws.ec2.Vpc, availability_zone: string) {
        return new aws.ec2.Subnet(`arti-private-subnet-${cidr}`, {
            vpcId: vpc.id,
            cidrBlock: cidr,
            availabilityZone: availability_zone
        });
    }

    createPublicSubnet(cidr: string, vpc: aws.ec2.Vpc, availability_zone: string) {
        return new aws.ec2.Subnet(`arti-public-subnet-${cidr}`, {
            mapPublicIpOnLaunch: true,
            vpcId: vpc.id,
            cidrBlock: cidr,
            availabilityZone: availability_zone
        });
    }

    createLambdaSecurityGroup(vpc: aws.ec2.Vpc/*, source_traffic_security_group: aws.ec2.SecurityGroup*/) {
        return new aws.ec2.SecurityGroup("arti-sg-allow_all", {
            vpcId: vpc.id,
            ingress: [{
                protocol: "tcp",
                fromPort: 0,
                toPort: 65535,
                cidrBlocks: [vpc.cidrBlock, "172.31.0.0/16", "10.0.0.0/16"],
            }],
            egress: [
                {
                    protocol: "-1",
                    cidrBlocks: ["0.0.0.0/0"],
                    fromPort: 0,
                    toPort: 0
                }
            ]
        }, { dependsOn: [vpc] });
    }

    createNatGateway(subnet: aws.ec2.Subnet, eip: aws.ec2.Eip) {
        return new aws.ec2.NatGateway(`arti-nat-gw`, {
            subnetId: subnet.id,
            connectivityType: "public",
            allocationId: eip.allocationId
        }, { dependsOn: [subnet, eip] });
    }

    createNatGwEip() {
        return new aws.ec2.Eip(`arti-public-subnet-nat-gw-eip`, {
            vpc: true
        });
    }

    async createLambdaFunctions(role: aws.iam.Role) {
        const defaultAvailabilityZone = "eu-central-1a";
        const vpc = this.createApplicativeVPC("10.0.0.0/16");
        const privateSubnet = this.createPrivateSubnet("10.0.1.0/24", vpc, defaultAvailabilityZone);
        const publicSubnet = this.createPublicSubnet("10.0.2.0/24", vpc, defaultAvailabilityZone);
        const natGwEip = this.createNatGwEip();
        const securityGroup = this.createLambdaSecurityGroup(vpc);
        const igw = new aws.ec2.InternetGateway(`${this.BaseResourceName}-vpc-igw`);
        const igwa = new aws.ec2.InternetGatewayAttachment(`${this.BaseResourceName}-vpc-igwa`, {
            internetGatewayId: igw.id,
            vpcId: vpc.id
        }, { dependsOn: [igw, vpc] });
        const natGateway = this.createNatGateway(publicSubnet, natGwEip);
        const prvNatGwRouteTable = new aws.ec2.RouteTable(`${this.BaseResourceName}-nat-gw-rt`, {
            vpcId: vpc.id,
            routes: [
                { cidrBlock: "0.0.0.0/0", natGatewayId: natGateway.id },
            ],
        });

        const pubRouteTable = new aws.ec2.RouteTable(`${this.BaseResourceName}-pub-rt`, {
            vpcId: vpc.id,
            routes: [
                { cidrBlock: "0.0.0.0/0", gatewayId: igw.id }
            ]
        }, { dependsOn: [vpc] })

        const pubRouteTableAssoc = new aws.ec2.RouteTableAssociation(`${this.BaseResourceName}-pub-subnet-igw-rta`, {
            routeTableId: pubRouteTable.id,
            subnetId: publicSubnet.id
        }, { dependsOn: [pubRouteTable] });

        const privSubnetIds = [privateSubnet.id];
        const privRtAssoc = [];

        for (let i = 0; i < 1; i++) {
            const pushed = new aws.ec2.RouteTableAssociation(`${this.BaseResourceName}-private-rta-${i+1}`, {
                routeTableId: prvNatGwRouteTable.id,
                subnetId: privSubnetIds[i]
            });
            privRtAssoc.push(pushed);
        };
        
        const nodeModulesLayer = new aws.lambda.LayerVersion(`${this.BaseResourceName}-modules-layer`, {
            s3Key: "arti/layers/node_modules.zip",
            s3Bucket: "code-lambda-artifacts",
            compatibleRuntimes: [aws.lambda.Runtime.NodeJS14dX, aws.lambda.Runtime.NodeJS16dX, aws.lambda.Runtime.NodeJS18dX],
            compatibleArchitectures: ["x86_64"],
            layerName: `${this.BaseResourceName}-modules`
        });

        const prismaClientLayer = new aws.lambda.LayerVersion(`${this.BaseResourceName}-prisma-client-layer`, {
            s3Key: "arti/layers/prisma-client.zip",
            s3Bucket: "code-lambda-artifacts",
            compatibleRuntimes: [aws.lambda.Runtime.NodeJS14dX, aws.lambda.Runtime.NodeJS16dX, aws.lambda.Runtime.NodeJS18dX],
            compatibleArchitectures: ["x86_64"],
            layerName: `${this.BaseResourceName}-prisma-client`
        });

        const redisSubnetGroup = new aws.elasticache.SubnetGroup(`${this.BaseResourceName}-redis-subnet-group`, {
            subnetIds: [privateSubnet.id],
            name: `${this.BaseResourceName}-redis-subnet-group`
        });

        const ecCluster = new aws.elasticache.Cluster(`${this.BaseResourceName}-ec-cluster`, {
            engine: "redis",
            nodeType: "cache.t3.micro",
            numCacheNodes: 1,
            engineVersion: "7.0",
            // parameterGroupName: "default.redis7.0",
            port: 6379,
            subnetGroupName: redisSubnetGroup.name,
            securityGroupIds: [securityGroup.id],
            applyImmediately: true
        });

        // const bucket = aws.s3.getBucket({ bucket: "code-lambda-artifacts" });
        // const object = await aws.s3.getBucketObject({
        //     bucket: (await bucket).id,
        //     key: "arti/backend.zip"
        // });

        const cacheNodes = await GetValue(ecCluster.cacheNodes);
        const backendLambda = new aws.lambda.Function(`${this.BaseResourceName}-lambda`, {
            runtime: aws.lambda.Runtime.NodeJS18dX,
            name: `${this.BaseResourceName}-fn`,
            code: new pulumi.asset.AssetArchive({
                "dist/server.js": new pulumi.asset.StringAsset(
                    "exports.handler = (e, c, cb) => cb(null, {statusCode: 200, body: 'Hello, world!'});"
                )
            }),
            layers: [nodeModulesLayer.arn.apply(arn => `${arn.slice(0, -1)}6`), prismaClientLayer.arn.apply(arn => `${arn.slice(0, -1)}6`)],
            handler: "dist/functions/api/index.handler",
            memorySize: 256,
            timeout: 45,
            vpcConfig: {
                subnetIds: [privateSubnet.id],
                securityGroupIds: [securityGroup.id]
            },
            role: role.arn,
            environment: {
                variables: {
                    "ENVIRONMENT": "lambda",
                    "REDIS_URL": cacheNodes[0].address
                }
            }
        }, { dependsOn: [vpc, privateSubnet, securityGroup, nodeModulesLayer, prismaClientLayer] });

        const streamingLambda = new aws.lambda.Function(`${this.BaseResourceName}-streaming-lambda`, {
            runtime: aws.lambda.Runtime.NodeJS18dX,
            name: `${this.BaseResourceName}-streaming-fn`,
            code: new pulumi.asset.AssetArchive({
                "dist/server.js": new pulumi.asset.StringAsset(
                    "exports.handler = (e, c, cb) => cb(null, {statusCode: 200, body: 'Hello, world!'});"
                )
            }),
            layers: [nodeModulesLayer.arn.apply(arn => `${arn.slice(0, -1)}6`), prismaClientLayer.arn.apply(arn => `${arn.slice(0, -1)}6`)],
            handler: "dist/functions/streaming/index.handler",
            memorySize: 256,
            timeout: 45,
            vpcConfig: {
                subnetIds: [privateSubnet.id],
                securityGroupIds: [securityGroup.id]
            },
            role: role.arn,
            environment: {
                variables: {
                    "ENVIRONMENT": "lambda",
                    "REDIS_URL": cacheNodes[0].address,
                    "STREAMING_LAMBDA": "true"
                }
            }
        }, { dependsOn: [vpc, privateSubnet, securityGroup, nodeModulesLayer, prismaClientLayer] });

        return { igw, backendLambda, streamingLambda, cacheNodes, ecCluster, redisSubnetGroup, nodeModulesLayer, prismaClientLayer };
    }

    createLambdaRole() {
        return new aws.iam.Role(`${this.BaseResourceName}-lambda-role`, {
            name: "AWSLambdaArtiBackendRole",
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: {
                        Service: "lambda.amazonaws.com",
                    },
                    Action: "sts:AssumeRole",
                }],
            }),
        })
    }

    createDNSRecords(zone: aws.route53.Zone, domain: aws.apigatewayv2.DomainName, distribution?: aws.cloudfront.Distribution) {
        new aws.route53.Record(`${this.BaseResourceName}-api-dns-record`, {
            zoneId: zone.zoneId,
            type: "A",
            name: `${this.SubDomain}`,
            aliases: [{
                name: domain.domainNameConfiguration.apply(domainNameConfiguration => domainNameConfiguration.targetDomainName),
                evaluateTargetHealth: false,
                zoneId: domain.domainNameConfiguration.apply(domainNameConfiguration => domainNameConfiguration.hostedZoneId)
            }]
        }, { dependsOn: zone });

        if (distribution) {
            new aws.route53.Record(`${this.BaseResourceName}-api-streams-dns`, {
                zoneId: zone.zoneId,
                type: "A",
                name: `${this.StreamsSubDomain}`,
                aliases: [{
                    name: distribution.domainName,
                    evaluateTargetHealth: false,
                    zoneId: distribution.hostedZoneId
                }]
            }, { dependsOn: [zone, distribution] });
        }
    }

    createHostedZone() {
        const zone = new aws.route53.Zone(`${this.BaseResourceName}-zone`, {
            name: this.DomainName
        });
        return zone;
    }
}
