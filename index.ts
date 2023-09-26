import { mainIGW } from './src/network/internet-gateway';
import { mainNatGw } from './src/network/nat-gateway';
import { mainPrivateSubnet, mainPublicSubnet } from './src/network/subnet';
import * as aws from "@pulumi/aws";
import { config } from "./src/globals/config";
import { ACMSSLCertificate } from './src/dns/ssl';
import { HostedZone } from './src/dns/zone';
import { DNS } from "./src/dns/domains";
import { mainRedisAllowAllSG } from './src/network/security-groups';
import { RedisCluster } from './src/datastores/redis';
import { mainVPC } from './src/network/vpc';
import './src/network/route-tables';

(async function () {
    const artiBackSubDomain = "back";
    const artiStreamsSubDomain = "streams";
    const artiDomain = config.require("arti_domain");

    const region = aws.Region.EUCentral1;
    
    // Start of arti-backend.ts
    const euCentralProvider = new aws.Provider(`aws-provider-${region}`, { region, profile: "personal_sagi" });
    const usEast1Provider = new aws.Provider(`aws-provider-${aws.Region.USEast1}`, { region: aws.Region.USEast1, profile: "personal_sagi" });
    const artiHostedZone = new HostedZone(artiDomain).create();
    const artiBackDNS = new DNS(artiHostedZone);
    const artiRegisteredDomain = artiBackDNS.updateDomainNameServers(artiDomain);

    const artiMainACMSSL = new ACMSSLCertificate(artiDomain, artiHostedZone, aws.Region.EUCentral1, euCentralProvider);
    const artiBackACMSSL = new ACMSSLCertificate(`${artiBackSubDomain}.${artiDomain}`, artiHostedZone, aws.Region.EUCentral1, euCentralProvider);
    const artiStreamACMSSL = new ACMSSLCertificate(`${artiStreamsSubDomain}.${artiDomain}`, artiHostedZone, aws.Region.USEast1, usEast1Provider);

    // Redis
    const redisSubnetGroup = new aws.elasticache.SubnetGroup(`main-redis-subnet-group`, {
        subnetIds: [mainPrivateSubnet.id],
        name: `main-redis-subnet-group`
    });
    const redisCluster = new RedisCluster("main", redisSubnetGroup, [mainRedisAllowAllSG.id]);
    redisCluster.cluster.cacheNodes[0].address

    exports.domains = {
        hostedZones: {
            arti: artiHostedZone
        },
        registeredDomains: {
            arti: artiRegisteredDomain
        }
    }

    exports.network = {
        natGateways: {
            main: mainNatGw
        },
        subnets: {
            mainPrivateSubnet,
            mainPublicSubnet
        },
        internetGateways: {
            main: mainIGW
        },
        vpc: {
            main: mainVPC
        },
        securityGroups: {
            main: mainRedisAllowAllSG
        }
    };

    exports.acm = {
        sslCertificates: {
            arti: {
                main: artiMainACMSSL,
                back: artiBackACMSSL,
                streams: artiStreamACMSSL
            }
        }
    };

    exports.datastores = {
        redis: {
            main: redisCluster.cluster
        }
    }
})()



















// import { ApplicativeArtiBackend } from './src/modules/applicative/arti-backend';
// // import { ApplicativeArtiLanding } from './src/modules/applicative/arti-landing';
// import { ApplicativeArtiFrontend } from './src/modules/applicative/arti-frontend';

// // const { landingPageApp } = new ApplicativeArtiLanding().create();

// // exports.landingApp = {
// //     app: landingPageApp
// // };

// new ApplicativeArtiFrontend().create().then(({ frontApp, domainAssociation, frontAppMasterBranch }) => {
//     exports.frontApp = {
//         app: frontApp,
//         domainAssociation: domainAssociation,
//         branch: frontAppMasterBranch
//     };
// });

// new ApplicativeArtiBackend().create().then(({ records }) => {
//     exports.records = {
//         records
//     };
// });