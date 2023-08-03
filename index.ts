import { ApplicativeArtiBackend } from './src/modules/applicative/arti-backend';
// import { ApplicativeArtiLanding } from './src/modules/applicative/arti-landing';
import { ApplicativeArtiFrontend } from './src/modules/applicative/arti-frontend';

// const { landingPageApp } = new ApplicativeArtiLanding().create();

// exports.landingApp = {
//     app: landingPageApp
// };

new ApplicativeArtiFrontend().create().then(({ frontApp, domainAssociation, frontAppMasterBranch }) => {
    exports.frontApp = {
        app: frontApp,
        domainAssociation: domainAssociation,
        branch: frontAppMasterBranch
    };
});

new ApplicativeArtiBackend().create().then(({ apiGateway }) => {
    exports.artiApiGateway = {
        apiGateway
    };
});

