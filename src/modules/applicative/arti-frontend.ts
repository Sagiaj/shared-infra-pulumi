import * as aws from "@pulumi/aws";
import { App } from "@pulumi/aws/amplify";
import { accessTokens, config } from '../../globals/config';

export class ApplicativeArtiFrontend {
    // private DomainName = config.require("arti_domain_front");
    private DomainName = config.require("arti_domain");
    private BaseResourceName = "arti-front";
    
    async create() {
        const frontApp = this.createAmplifyApp();
        const domainAssociation = this.createDomainAssociation(frontApp);
        const frontAppMasterBranch = this.createAppMasterBranch(frontApp);
        return {
            frontApp,
            domainAssociation,
            frontAppMasterBranch
        }
    }

    createHostedZone() {
    }

    createAppMasterBranch(app: App) {
        return new aws.amplify.Branch(`${this.BaseResourceName}-branch-master`, {
            appId: app.id,
            branchName: "master",
            enableAutoBuild: true,
            environmentVariables: {
                domain: this.DomainName,
                environment: "production"
            },
            framework: "Vue"
        });
    }

    createDomainAssociation(app: App) {
        return new aws.amplify.DomainAssociation(`${this.BaseResourceName}-domain`, {
            appId: app.id,
            domainName: this.DomainName,
            subDomains: [{
                branchName: "master",
                prefix: "app",
            }],
            waitForVerification: true
        }, { dependsOn: [app] });
    }

    createAmplifyApp() {
        return new aws.amplify.App(`${this.BaseResourceName}-app`, {
            name: `${this.BaseResourceName}-app`,
            accessToken: accessTokens.githubFrontApp.value,
            repository: "https://github.com/Sagiaj/article-generator-app-front",
            buildSpec: `version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm install
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: /dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
`,
            customRules: [{
                source: "/<*>",
                status: "404",
                target: "/index.html",
            }, {
                source: `https://${this.DomainName}`,
                status: "302",
                target: `https://www.${this.DomainName}`,
            }],
            enableBranchAutoBuild: true,
            environmentVariables: {
                domain: this.DomainName,
                environment: "production"
            }
        });
    }
}
