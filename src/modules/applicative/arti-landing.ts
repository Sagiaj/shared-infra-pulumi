import * as aws from "@pulumi/aws";

export class ApplicativeArtiLanding {
    create() {
        // Create the Amplify app
        const landingPageApp = aws.amplify.App.get("article-generator-landing", "dlb6zbftr6rls");

        return {
            landingPageApp
        }
    }
}
