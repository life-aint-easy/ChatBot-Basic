const
    express = require('express'),
    bodyParser = require('body-parser'),
    path = require('path'),
    apiai = require('apiai'),
    request = require('request'),
    config = require('config'),
    // crypto = require('crypto-js'),
    app = express(),
    apiApp = apiai(config.get('clientaccesstoken'));

const PORT = process.env.PORT || 1337;
const PAGE_ACCESS_TOKEN = config.get('pageAccessToken');
    
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

app.get('/', express.static(path.join(__dirname, 'public')));

// Creates the endpoint for our webhook 
app.post('/webhook', (req, res) => {

    let body = req.body;

    // Checks this is an event from a page subscription
    if (body.object === 'page') {

        // Iterates over each entry - there may be multiple if batched
        body.entry.forEach(function (entry) {

            // let appsecret_proof = crypto.HmacSHA256(config.get('pageAccessToken'), config.get('appSecret')).toString(crypto.enc.Hex);
            // console.log(appsecret_proof);

            // Gets the message. entry.messaging is an array, but 
            // will only ever contain one message, so we get index 0
            console.log(entry)
            if (entry.changes && entry.changes[0].field == "feed") {
                let webhook_event = entry.changes[0].value;
                console.log(webhook_event);

                // Get the PSID
                let sender_psid = webhook_event.from.id;
                let sender_name = webhook_event.from.name;
                console.log('Sender PSID: ' + sender_psid);
                console.log('Sender PSID: ' + sender_name);
                
                handleComment(sender_psid, sender_name);
            } else {
                let webhook_event = entry.messaging[0];
                console.log(webhook_event);

                // Get the sender PSID
                let sender_psid = webhook_event.sender.id;
                console.log('Sender PSID: ' + sender_psid);

                // Check if the event is a message or postback and
                // pass the event to the appropriate handler function
                if (webhook_event.message) {
                    handleMessage(sender_psid, webhook_event.message);
                } else if (webhook_event.postback) {
                    handlePostback(sender_psid, webhook_event.postback);
                } else {
                    console.log("Getting something else")
                }
            }
        });

        // Returns a '200 OK' response to all requests
        res.status(200).send('EVENT_RECEIVED');
    } else {
        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }

});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {

    // Your verify token. Should be a random string.
    let VERIFY_TOKEN = config.get('validationToken');

    // Parse the query params
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    // Checks if a token and mode is in the query string of the request
    if (mode && token) {

        // Checks the mode and token sent is correct
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {

            // Responds with the challenge token from the request
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);

        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    }
});

// Handles messages events
function handleMessage(sender_psid, received_message) {
    let response;

    // Checks if the message contains text
    if (received_message.text) {

        // Creates the payload for a basic text message, which
        // will be added to the body of our request to the Send API
        let apiResponse = apiApp.textRequest(received_message.text, {
            sessionId: received_message.text
        })

        apiResponse.on('response', (res) => {
            response = {
                "text" : res.result.fulfillment.messages[0].speech
            }
            console.log('Inside', res);

            // Sends the response message
            callSendAPI(sender_psid, response);
        })

        apiResponse.on('error', () => console.log("Error from api ai"))

        // response = {
        //     "text": `You sent the message: "${received_message.text}". Now send me an attachment!`
        // }
        apiResponse.end();

    } else if (received_message.attachments) {

        // Gets the URL of the first message attachment
        let attachment_url = received_message.attachments[0].payload.url;

        response = {
            "attachment": {
                "type": "template",
                "payload": {
                    "template_type": "generic",
                    "elements": [{
                        "title": "Is this the right picture?",
                        "subtitle": "Tap a button to answer.",
                        "image_url": attachment_url,
                        "buttons": [
                            {
                                "type": "postback",
                                "title": "Yes!",
                                "payload": "yes",
                            },
                            {
                                "type": "postback",
                                "title": "No!",
                                "payload": "no",
                            }
                        ],
                    }]
                }
            }
        }

        // Sends the response message
        callSendAPI(sender_psid, response);

    }
}

// Handles messaging_postbacks events
function handlePostback(sender_psid, received_postback) {
    let response;

    // Get the payload for the postback
    let payload = received_postback.payload;

    // Set the response based on the postback payload
    if (payload === 'yes') {
        response = { "text": "Thanks!" }
    } else if (payload === 'no') {
        response = { "text": "Oops, try sending another image." }
    }

    // Send the message to acknowledge the postback
    callSendAPI(sender_psid, response);
}

function handleComment(sender_psid, sender_name) {
    let response = {
        "text": `Hi ${sender_name}, I am LazyGod here to help you with your recent activity on LazyGod Page\nAsk me anything`
    }

    // Send the message to related to comment
    callSendAPI(sender_psid, response);
}

// Sends response messages via the Send API
function callSendAPI(sender_psid, response) {
    // Construct the message body
    let request_body = {
        "recipient": {
            "id": sender_psid
        },
        "message": response
    }

    // Send the HTTP request to the Messenger Platform
    request({
        "uri": "https://graph.facebook.com/v2.6/me/messages",
        "qs": { "access_token": PAGE_ACCESS_TOKEN },
        "method": "POST",
        "json": request_body
    }, (err, res, body) => {
        if (!err) {
            console.log('message sent!')
        } else {
            console.error("Unable to send message:" + err);
        }
    }); 
}

app.listen(PORT, () => console.log("webhook is listening"));