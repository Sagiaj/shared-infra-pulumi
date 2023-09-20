import * as aws from "@pulumi/aws";

export class IAM {

    createLambdaRole(name: string) {
        return new aws.iam.Role(`${name}-lambda-role`, {
            name,
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: {
                        Service: "lambda.amazonaws.com",
                    },
                    Action: "sts:AssumeRole",
                }],
            })
        })
    }
}
