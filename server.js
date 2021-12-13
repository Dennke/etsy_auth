// Import the express and fetch libraries
const express = require('express');
const fetch = require('node-fetch');
const hbs = require('hbs');
const crypto = require('crypto');
const {base64URLEncode, sha256} = require('./code_generator');
const fs = require('fs');
const exphbs = require('express-handlebars');

// Create a new express application
const app = express();

const handlebars = exphbs.create({ extname: '.hbs',});
app.engine('.hbs', handlebars.engine);
app.set('view engine', '.hbs');

const configFile = JSON.parse(fs.readFileSync('./config.txt', 'utf8'));


// This renders our `index.hbs` file.
app.get('/', async (req, res) => {

    res.render("index.hbs", {
        generateURL: 'http://localhost:3003/generate',
        receiptURL: 'http://localhost:3003/showreceipts',
        articleURL: 'http://localhost:3003/showorderedarticles'
    });

});

/**
 These variables contain your API Key, the state sent
 in the initial authorization request, and the client verifier compliment
 to the code_challenge sent with the initial authorization request
 */

app.get("/oauth/redirect", async (req, res) => {
    // The req.query object has the query params that Etsy authentication sends
    // to this route. The authorization code is in the `code` param
    const authCode = req.query.code;
    const tokenUrl = 'https://api.etsy.com/v3/public/oauth/token';
    const requestOptions = {
        method: 'POST',
        body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: configFile['clientID'],
            redirect_uri: configFile['redirectUri'],
            code: authCode,
            code_verifier: configFile['codeVerifier'],
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const response = await fetch(tokenUrl, requestOptions);

    // Extract the access token from the response access_token data field
    if (response.ok) {
        const tokenData = await response.json();
        configFile['accessToken'] = tokenData.access_token;
        configFile['userID'] = tokenData.access_token.split('.')[0];
        fs.writeFileSync('./config.txt', JSON.stringify(configFile));
        res.redirect(`/welcome`);
    } else {
        res.send("oops");
    }
});


app.get("/welcome", async (req, res) => {

    // An Etsy access token includes your shop/user ID
    // as a token prefix, so we can extract that too

    const requestOptions = {
        headers: {
            'x-api-key': configFile['clientID'],
            // Scoped endpoints require a bearer token
            Authorization: `Bearer ` + configFile['accessToken'],
        }
    };

    const response = await fetch(
        'https://openapi.etsy.com/v3/application/users/' + configFile['userID'],
        requestOptions
    );

    if (response.ok) {
        const userData = await response.json();
        // Load the template with the first name as a template variable.
        res.render("welcome.hbs", {
            first_name: userData.first_name,
            receiptURL: 'http://localhost:3003/showreceipts',
            articleURL: 'http://localhost:3003/showorderedarticles'
        });
    } else {
        res.send("oops");
    }

});

app.get('/showreceipts', async (req, res) => {

    const requestOptions = {
        headers: {
            'x-api-key': configFile['clientID'],
            Authorization: `Bearer ` + configFile['accessToken'],
            'Content-Type': 'application/json'
        }
    };
    const response = await fetch(
        'https://openapi.etsy.com/v3/application/shops/' + configFile['shopID'] + '/receipts?' + 'limit=100&was_paid=true&was_shipped=false',
        requestOptions
    );

    let regionNames = new Intl.DisplayNames(['en'], {type: 'region'});
    if (response.ok) {
        const responseJson = await response.json();
        receipts = responseJson['results'];
        for(const receipt of responseJson['results']) {
             receipt['country_iso'] = regionNames.of(receipt['country_iso']);
        }
        res.render('shippingcvs', { receipts });
    } else {
        res.send('fail');
    }
});

app.get('/showorderedarticles', async(req, res) => {
    const requestOptions = {
        headers: {
            'x-api-key': configFile['clientID'],
            Authorization: `Bearer ` + configFile['accessToken'],
            'Content-Type': 'application/json'
        }
    };
    const response = await fetch(
        'https://openapi.etsy.com/v3/application/shops/' + configFile['shopID'] + '/receipts?' + 'limit=100&was_paid=true&was_shipped=false',
        requestOptions
    );

    if(response.ok){
        const responseJson = await response.json();
        let result = {};
       for(const orders of responseJson['results']){
           for(const transaction of orders['transactions']){

                if(`${transaction['title']} ${transaction['variations'][0]['formatted_value']}` in result){
                    result[`${transaction['title']} ${transaction['variations'][0]['formatted_value']}`] += 1;
                }else{
                    result[`${transaction['title']} ${transaction['variations'][0]['formatted_value']}`] = 1;
                }
            }
        }
        res.send(result);
    }
    else{
        res.send('nope');
    }



})


app.get('/generate', async (req, res) => {
    configFile['codeVerifier'] = base64URLEncode(crypto.randomBytes(32));
    configFile['codeChallenge'] = base64URLEncode(sha256(configFile['codeVerifier']));
    configFile['state'] = Math.random().toString(36).substring(7);

    res.redirect(`https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=http://localhost:3003/oauth/redirect&scope=${configFile['scope']}&client_id=${configFile['clientID']}&state=${configFile['state']}&code_challenge=${configFile['codeChallenge']}&code_challenge_method=S256`)
});


// Start the server on port 3003
const port = 3003;
app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});
