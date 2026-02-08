# UINGame Authenication Server for uingame.co.il - IDM on wix code

SAML 2.0 Service Provider

## Local Setup
1. [git](https://git-scm.com/download) (to upload to production)
2. [heroku-cli](https://devcenter.heroku.com/articles/heroku-cli) (to upload and manage to production)
3. [nodejs](https://nodejs.org/) and [yarn](https://yarnpkg.com/) (for local development)

## Uploading to production
Uploading to heroku is done using git.

Setup your repository using the `heroku` cli:
```sh
heroku login
heroku git:remote -a uingame-auth
```

Now you can upload by pushing to the heroku remote running:
```sh
git push heroku master
```

## Monitoring production
In order to see the live log from production run:
```sh
heroku logs --tails
```
It is useful to run this while restarting the server, changing environment variables, etc.

## Obtaining a certificate
1. Browse [here](https://www.sslforfree.com/create?domains=auth.uingame.co.il), this is a site that automates certificate creation using [Let's Encrypt](https://letsencrypt.org/)
    1. Choose "Manual Verification"
    2. Click "Manually Verify Domain"
    3. Download the verification file
2. Browse to [heroku app setting](https://dashboard.heroku.com/apps/uingame-auth/settings)
    1. Under "Domains and certificates" click "Configure SSL"
    2. Tick "Remove SSL" and click "Continue". **(note that users will not be able to login until this is switched back)**
    3. Click "Reveal Config Var" to see the environment variables
    4. Set `ACME_CHALLENGE_TOKEN` to the varification **file name**
    5. Set `ACME_CHALLENGE_VALUE` to the varification **file content**
3. Go back to the first site and click "Download certificates", you will be provided with the certificate and the private key
4. Go back to heroku and turn automatic SSL back on (it will take a few minutes for users to be able to sign in again)

## Server Configurations
The server is configured using environment variables that can be found and changed in [heroku app settings](https://dashboard.heroku.com/apps/uingame-auth/settings).

Available settings are:

| Variable | Description | Default Value |
| --- | --- | --- |
| PORT | Port for the server to run | set by heroku |
| REDISTOGO_URL | Redis server url | set by heroku |
| TOKEN_EXPIRATION | Expiration for the token produced by the server (in seconds) | 300 (5 minutes) |
| CORS_ORIGIN | Allowed origin for verification endpoint | https://www.uingame.co.il |
| SUCCESS_REDIRECT | Location to navigate the user after successful login | https://www.uingame.co.il/createsession |
| LOGOUT_REDIRECT | Location to navigate the user after logging out | https://www.uingame.co.il |
| IDP_METADATA_URL | URL to obtain IDP metadata | https://lgn.edu.gov.il/nidp/saml2/metadata |
| LOGOUT_URL | IDP url for logging out | https://lgn.edu.gov.il/nidp/jsp/logoutSuccess.jsp |
| SAML_PRIVATE_KEY | Private key for signing SAML requests | |
| SAML_CERT | Public certificate to publish in SAML metadata | |
| ACME_CHALLENGE_TOKEN | Token for verifing domain ownerwhip using ACME HTTP Challenge | |
| ACME_CHALLENGE_VALUE | Voken for verifing domain ownerwhip using ACME HTTP Challenge | |

### LRS (MoE xAPI) Settings

These variables are required for MoE Learning Record Store (LRS) integration:

| Variable | Description | How to Obtain |
| --- | --- | --- |
| LRS_ENABLED | Enable/disable LRS integration | Set to `"true"` to enable |
| LRS_BASE_URL | LRS endpoint URL | Staging: `https://lrs-stg.education.gov.il`<br>Production: `https://lrs.education.gov.il` |
| LRS_CLIENT_ID | OAuth client ID | **Contact MoE integration team** - not specified in code |
| LRS_CLIENT_SECRET | OAuth client secret | **Contact MoE integration team** - not specified in code |
| LRS_SCOPE | OAuth scope | Staging: `lrs`<br>Production: `lrsprod` |
| LRS_COOKIE_SECRET | Secret for signing session cookies | Generate with: `openssl rand -hex 16` |
| LRS_ECAT_ITEM_URI | eCat item URI (optional) | **Obtain from MoE if required** - not specified in code |
| LRS_LOG_USER_KEYS | Enable debug logging of user object keys | Set to `"true"` for staging debugging |

**Note:** `LRS_CLIENT_ID`, `LRS_CLIENT_SECRET`, and `LRS_ECAT_ITEM_URI` must be obtained directly from the MoE integration team. The codebase does not specify the contact method, portal URL, or request process. Please contact your MoE integration contact for these credentials.

## Test Profiles:
<table style="direction: rtl">
  <thead>
    <td>סוג</td>
    <td>זהות</td>
    <td>קוד</td>
    <td>סיסמא</td>
    <td>מוסד וכיתה<td>
    <td>profile</td>
  </thead>
  <tbody>
    <tr>
      <td> לדוגמה 
        תלמיד</td>
      <td>0226633444</td>
      <td>2933523</td>
      <td>123456</td>
      <td>44444 </td>
      <td>
        <pre style="direction: ltr">
{
  "issuer": "https://is.remote.education.gov.il/nidp/saml2/metadata",
  "sessionIndex": "idiY1dyZP15I5N_MFg2IAPmRAmtcM",
  "nameID": "xP9Oq4k9qRsDNUAQbj9PF2o8TRphNkYYX7D/jg==",
  "nameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
  "nameQualifier": "https://is.remote.education.gov.il/nidp/saml2/metadata",
  "spNameQualifier": "http://auth.uingame.co.il",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/studentmakbila": "2",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/studentmosad": "444444",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "0226633444",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": "פלוני",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "אלמוני",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/zehut": "216636092",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/displayname": "ג'אדי טראבין",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/studentkita": "5",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/orgrolesyeshuyot": "444444",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/isstudent": "Yes"
}
        </pre>
      </td>
    </tr>
    <tr>
      <td>בעל תפקיד</td>
      <td>055544333</td>
      <td>1308918</td>
      <td>123qweASD</td>
      <td>123456</td>
      <td>
        <pre style="direction: ltr">
{
  "issuer": "https://is.remote.education.gov.il/nidp/saml2/metadata",
  "sessionIndex": "idBPNsA7JYXObk_Go3DZ6y1_VLtFQ",
  "nameID": "oT8ZmOFKRl+SJlMDfSxcBHguWAp/KlEPSKfomQ==",
  "nameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
  "nameQualifier": "https://is.remote.education.gov.il/nidp/saml2/metadata",
  "spNameQualifier": "http://auth.uingame.co.il",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name": "0057626053",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname": "ישראלה",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/orgrolecomplex": "667[Maarechet_hinuch:99999999]",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname": "ישראלה",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/zehut": "055544333",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/displayname": "ישראלה",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/orgrolessimple": "667[Maarechet_hinuch:99999999]",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/orgrolesyeshuyot": "99999999",
  "http://schemas.education.gov.il/ws/2015/01/identity/claims/isstudent": "No"
}
        </pre>
      </td>
    </tr>
  </tbody>
</table>
