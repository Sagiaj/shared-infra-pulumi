import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export class RedisCluster {
    cluster: aws.elasticache.Cluster;

    constructor(clusterName: string, subnetGroup: aws.elasticache.SubnetGroup, securityGroupIds: pulumi.Input<string>[]) {
        this.cluster = new aws.elasticache.Cluster(`${clusterName}-ec-redis-cluster`, {
            engine: "redis",
            nodeType: "cache.t3.micro",
            numCacheNodes: 1,
            engineVersion: "7.0",
            // parameterGroupName: "default.redis7.0",
            port: 6379,
            subnetGroupName: subnetGroup.name,
            securityGroupIds,
            applyImmediately: true
        });
    }
}
