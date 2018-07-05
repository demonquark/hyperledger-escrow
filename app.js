/**
 * Copyright 2017 IBM All Rights Reserved.
 * Modifications by Krishna
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

'use strict';
var express = require('express');
// var session = require('express-session');
// var cookieParser = require('cookie-parser');
var expressJWT = require('express-jwt');
var jwt = require('jsonwebtoken');
var bearerToken = require('express-bearer-token');
var bodyParser = require('body-parser');
var http = require('http');
var cors = require('cors');

var app = express();

require('./config.js');
var hfc = require('fabric-client');

// --- START APP HELPER FILES
var helper = require('./app/helper.js');
var createChannel = require('./app/create-channel.js');
var join = require('./app/join-channel.js');
var install = require('./app/install-chaincode.js');
var instantiate = require('./app/instantiate-chaincode.js');
var invoke = require('./app/invoke-transaction.js');
var query = require('./app/query.js');
// --- END APP HELPER FILES

var logger = helper.getLogger('DemoApp');
var host = process.env.HOST || hfc.getConfigSetting('host');
var port = process.env.PORT || hfc.getConfigSetting('port');
var orgs = ['Org1', 'Org2', 'Org3'];

//support parsing of application/json type post data
app.options('*', cors());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: false
}));

// set secret variable
app.set('secret', 'thisismysecret');
app.use(expressJWT({
	secret: 'thisismysecret'
}).unless({
	path: ['/users','/orgs']
}));

// resolve tokens
app.use(bearerToken());
app.use(function(req, res, next) {
	res.setHeader('Content-Type', 'application/json');
	logger.debug(' ------>>>>>> new request for %s',req.originalUrl);
	if (req.originalUrl.indexOf('/users') >= 0 || req.originalUrl.indexOf('/orgs') >= 0) {
		return next();
	}

	var token = req.token;
	jwt.verify(token, app.get('secret'), function(err, decoded) {
		if (err) {
			res.json({
				success: false,
				message: 'Failed to authenticate token. Make sure to include the ' +
					'token returned from /users call in the authorization header ' +
					' as a Bearer token'
			});
			return;
		} else {
			// add the decoded user name and org name to the request object
			req.body.username = decoded.username;
			req.body.orgname = decoded.orgname;
			logger.debug('Decoded from JWT token: username - ' + decoded.username + ', orgname - ' + decoded.orgname);
			return next();
		}
	});
});

///////////////////////////////////////////////////////////////////////////////
//////////////////////////////// START SERVER /////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var server = http.createServer(app).listen(port, function() {});
logger.info('****************** SERVER STARTED ************************');
logger.info('***************  http://%s:%s  ******************',host,port);
server.timeout = 240000;

///////////////////////////////////////////////////////////////////////////////
///////////////////////// REST ENDPOINTS START HERE ///////////////////////////
///////////////////////////////////////////////////////////////////////////////

// Register and enroll user
app.post('/users', async function(req, res) {
	logger.info('<<<<<<<<<<<<<<<<< U S E R  L O G I N >>>>>>>>>>>>>>>>>');
	logger.debug('End point : /users');

	// validate the request
	let fields = Object.assign(req.body);
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return;
	}

	// Generate a web token
	var token = jwt.sign({
		exp: Math.floor(Date.now() / 1000) + parseInt(hfc.getConfigSetting('jwt_expiretime')),
		username: fields.username,
		orgname: fields.orgname,
		role: fields.role
	}, app.get('secret'));

	// Get the registered user (If user is unregistered, register him)
	let response = await helper.getRegisteredUser(fields.username, fields.orgname, true);
	logger.debug('-- returned from registering the username %s for organization %s', fields.username, fields.orgname);

	if (response && typeof response !== 'string' && response.success) {
		response.token = token;
		logger.debug('Successfully registered a user: %s', JSON.stringify(response));
	}

	res.json(response);

});

// Create Channel
app.post('/channels', async function(req, res) {
	logger.info('<<<<<<<<<<<<<<<<< C R E A T E  C H A N N E L >>>>>>>>>>>>>>>>>');
	logger.debug('End point : /channels');

	// validate the request
	let fields = Object.assign(req.body);
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname', 
								'channelName', 'channelConfigPath']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return;
	}

	// Create a channel
	let message = await createChannel.createChannel(fields.channelName, fields.channelConfigPath, 
					fields.username, fields.orgname);
	res.json(message);
});

// Join Channel
app.post('/channels/:channelName/peers', async function(req, res) {
	logger.info('<<<<<<<<<<<<<<<<< J O I N  C H A N N E L >>>>>>>>>>>>>>>>>');
	logger.debug('End point : /channels/:channelName/peers');

	// validate the request
	let fields = Object.assign(req.body, req.params);
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname', 'channelName', 'peers']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return;
	}

	// Join a channel
	let message =  await join.joinChannel(fields.channelName, fields.peers, fields.username, fields.orgname);
	res.json(message);
});

// Install chaincode on target peers
app.post('/chaincodes', async function(req, res) {
	logger.info('==================== INSTALL CHAINCODE ==================');
	logger.debug('End point : /chaincodes');

	// validate the request
	let fields = Object.assign(req.body);
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname', 'peers', 
								'chaincodeName', 'chaincodePath', 'chaincodeVersion', 'chaincodeType']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return; 	
	}

	// Install the chaincode
	let message = await install.installChaincode(fields.peers, fields.chaincodeName, fields.chaincodePath, 
					fields.chaincodeVersion, fields.chaincodeType, fields.username, fields.orgname);
	res.json(message);
});

// Instantiate chaincode on target peers
app.post('/channels/:channelName/chaincodes', async function(req, res) {
	logger.info('==================== INSTANTIATE CHAINCODE ==================');
	logger.debug('End point : /channels/:channelName/chaincodes');

	// validate the request
	let fields = Object.assign(req.body, req.params);
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname',
								'chaincodeName', 'chaincodeVersion', 'chaincodeType', 'channelName', 'args']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return; 	
	}

	// Optional request variables
	logger.debug('peers'.padEnd(12) + ': ' + fields['peers']);
	logger.debug('fcn'.padEnd(12) + ': ' + fields['fcn']);
	
	let message = await instantiate.instantiateChaincode(fields.peers, fields.channelName, fields.chaincodeName, 
		fields.chaincodeVersion, fields.chaincodeType, fields.fcn, fields.args, fields.username, fields.orgname);
	res.json(message);
});

// Invoke transaction on chaincode on target peers
app.post('/channels/:channelName/chaincodes/:chaincodeName/:function', async function(req, res) {
	logger.debug('==================== INVOKE ON CHAINCODE ==================');
	logger.debug('End point : /channels/:channelName/chaincodes/:chaincodeName/:function');

	// validate the request
	let fields = Object.assign(req.body, req.params);
	logger.debug('Input     : ' +  JSON.stringify(fields));
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname',
								'chaincodeName', 'channelName', 'function']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return;
	}

	// Optional request variables
	logger.debug('peers'.padEnd(12) + ': ' + fields['peers']);
	let response = {success: false, message :'nothing happened'};
	let createType = '';

	try{
		let fcn = fields.function.toString().toLowerCase();
		let args = [];

		if(fcn == "create"){
			createType = fields.type.toString(); 
			if (createType == "item") {
				args.push(createType);
				args.push(fields.details.name.toString());
				args.push(fields.details.amount.toString());
				args.push(fields.details.price.toString());	
			} else if (createType == "money"){
				args.push(createType);
				args.push(fields.details.name.toString());
				args.push(fields.details.amount.toString());
			} else if (createType == "po"){
				fcn = 'createPO';
				for (var i in fields.details) {
					args.push(JSON.stringify(fields.details[i]));
				}
			}
		}else if(fcn == "deliver" || fcn == "receive"){
			args.push(fields.po.toString());
			for (var i in fields.details) {
				args.push(JSON.stringify(fields.details[i]));
			}

		}else if(fcn == "transfer"){
			if(orgs.indexOf(fields.details.recipient.toString()) >= 0){
				args.push(fields.type.toString());
				args.push(fields.details.name.toString());
				args.push(fields.details.amount.toString());
				args.push(fields.details.recipient.toString() + 'MSP');
				if(fields.details.batch) {
					args.push(fields.details.batch.toString());
				}
			} else {
				throw new Error('Unknown Organization: ' + fields.details.recipient);
			}
		} else {
			throw new Error("Unknown function.");
		}

		logger.debug('Function: ' + fcn + ' | Arguments: ' + args);
		response = await invoke.invokeChaincode(fields.peers, fields.channelName, fields.chaincodeName, 
			fcn, args, fields.username, fields.orgname);

		if(fcn == "create"){
			response.type    = createType;
			response.name    = fields.details.name.toString();
			if(response.payload){
				response.success = response.payload.success;
				if(response.success == true) {
					response.sum     = response.payload.sum;
					response.amount  = response.payload.amount;
					if (createType == "item") {
						response.batch   = response.payload.batch;
					}	
				}
				if(response.payload.message) {
					response.message = response.payload.message;
				}
			} 
		}else if(fcn == "createPO"){
			if(response.payload){
				response.type    = createType;
				response.success = response.payload.success;
				response.status  = response.payload.status;
				response.total  = response.payload.total;
				if(response.success == true) {
					response.po      = response.payload.po;
					response.details = response.payload.details;
				} else {
					response.success = false;
				}
				if(response.payload.message) {
					response.message = response.payload.message;
				}
			}
		}else if(fcn == "deliver" || fcn.toLowerCase() == "receive"){
			if(response.payload){
				response.success = response.payload.success;
				if(response.success == true) {
					response.po      = response.payload.po;
					response.status  = response.payload.status;
					response.total  = response.payload.total;
					response.details = response.payload.details;
				}
				if(response.payload.message) {
					response.message = response.payload.message;
				}
			}
		}else if(fcn == "transfer"){
			if(response.payload){
				response.success    = response.payload.success;
				response.type       = response.payload.type;
				response.name       = response.payload.name;
				response.amount     = response.payload.amount;
				response.recipient  = fields.details.recipient.toString() + 'MSP';
				if(response.success == true) {
					response.batches = response.payload.batches;
				}
				if(response.payload.message) {
					response.message = response.payload.message;
				}
			}
		} else {
			throw new Error("Unknown function.");
		}			
	} catch (error) {
		let error_message = error.toString();
		response = {success: false, message: error_message};
	}

	if (response.payload || response.payload == null) {
		delete response.payload;
	}

	logger.debug('APP RESPONSE: ' + JSON.stringify(response));
	res.json(response);
});

// Query on chaincode on target peers
app.get('/channels/:channelName/chaincodes/:chaincodeName/:function', async function(req, res) {
	logger.debug('==================== QUERY BY CHAINCODE ==================');
	logger.debug('End point : /channels/:channelName/chaincodes/:chaincodeName/:function');

	// validate the request
	let fields = Object.assign(req.body, req.params, req.query);
	logger.debug('Input     : ' +  JSON.stringify(fields));	
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname',
								'chaincodeName', 'channelName', 'function']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return;
	}

	// Optional request variables
	logger.debug('peers'.padEnd(12) + ': ' + fields['peers']);
	let response = [];

	try{
		let fcn = 'query' + fields.function.toString().toUpperCase();
		let args = [];

		// Parse args
		if (fcn == 'queryNAMES'){
			args.push((fields.hasOwnProperty('owner') && fields.owner.toString() == 'true').toString());
		} else if (fcn == 'queryPO'){
			args.push((fields.hasOwnProperty('history') && fields.history.toString() == 'true').toString());
			if(fields.po > 0){
				args.push(fields.po);
			} else {
				fcn = fcn + 'ALL';
			}
		} else if (fcn == 'queryITEM') {
			fcn = 'query';
			args.push(fields.type);
			args.push(fields.name);
			if(fields.batch > 0){
				args.push(fields.batch);
			}
		}
		logger.debug('args(clean)'.padEnd(12) + ': ' + args);

		// Query the chain code
		let message = await query.queryChaincode(fields.peer, fields.channelName, fields.chaincodeName, args, 
			fcn, fields.username, fields.orgname);

		// Create output response
		if (fcn == 'queryNAMES'){
			if (message.success == true){
				for (var i=0; i < message.payload.items.length; i++){
					response.push(message.payload.items[i]);
				}
			}
		} else if (fcn == 'queryPOALL'){
			if (message.success == true){
				response = message.payload;
			}
		} else if (fcn == 'queryPO'){
			if (message.success == true){
				response = message.payload;
				response.success = message.success;
				response.message = message.message;
			}
		} else if (fcn == 'query'){
			if (message.success == true){
				response = message.payload;
				response.success = message.success;
				response.message = message.message;

				if(!(fields.history && fields.history.toString() == 'true')){
					for (var i=0; i < response.batches.length; i++){
						delete response.batches[i].history;
					}	
				}
			}
		}
		logger.debug(message);

	} catch (error) {
		logger.error('Query failed: ' +  error.toString());
	}

	logger.debug('APP RESPONSE: ' + JSON.stringify(response));
	res.json(response);
});

//  Query Get Block by BlockNumber
app.get('/channels/:channelName/blocks/:blockId', async function(req, res) {
	logger.debug('==================== GET BLOCK BY NUMBER ==================');
	logger.debug('End point : /channels/:channelName/transactions/:trxnId');

	// validate the request
	let fields = Object.assign(req.body, req.params, req.query);
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname', 'channelName', 'blockId']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return;
	}

	// Optional request variables
	logger.debug('peer'.padEnd(12) + ': ' + fields['peer']);

	let message = await query.getBlockByNumber(fields.peer, fields.channelName, fields.blockId, fields.username, fields.orgname);
	res.send(message);
});

// Query Get Transaction by Transaction ID
app.get('/channels/:channelName/transactions/:trxnId', async function(req, res) {
	logger.debug('==================== GET TRANSACTION BY TRANSACTION_ID ==================');
	logger.debug('End point : /channels/:channelName/transactions/:trxnId');

	// validate the request
	let fields = Object.assign(req.body, req.params, req.query);
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname', 'channelName', 'trxnId']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return;
	}

	// Optional request variables
	logger.debug('peer'.padEnd(12) + ': ' + fields['peer']);
	
	let message = await query.getTransactionByID(fields.peer, fields.channelName, fields.trxnId, fields.username, fields.orgname);
	res.send(message);
});

// Query Get Block by Hash
app.get('/channels/:channelName/blocks', async function(req, res) {
	logger.debug('==================== GET BLOCK BY HASH ==================');
	logger.debug('End point : /channels/:channelName/blocks');

	// validate the request
	let fields = Object.assign(req.body, req.params, req.query);
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname', 'channelName', 'hash']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return;
	}

	// Optional request variables
	logger.debug('peer'.padEnd(12) + ': ' + fields['peer']);

	let message = await query.getBlockByHash(fields.peer, fields.channelName, fields.hash, fields.username, fields.orgname);
	res.send(message);
});

// Query to fetch channels
app.get('/channels', async function(req, res) {
	logger.debug('==================== GET CHANNELS ==================');
	logger.debug('End point : /channels');

	// validate the request
	let fields = Object.assign(req.body, req.params, req.query);
	let validationResponse = helper.validateRequest(fields, ['username', 'orgname', 'peer']);
	if(!validationResponse.success) {
		res.json(validationResponse);
		return;
	}

	let message = await query.getChannels(fields.peer, fields.username, fields.orgname);
	res.send(message);
});

//Query for Channel Information
app.get('/channels/:channelName', async function(req, res) {
	logger.debug('================ GET CHANNEL INFORMATION ======================');
	logger.debug('channelName'.padEnd(12) + ': ' + req.params.channelName);
	logger.debug('peer'.padEnd(12) + ': ' + req.query.peer);

	let peer = req.query.peer;

	let message = await query.getChainInfo(peer, req.params.channelName, req.query.username, req.query.orgname);
	res.send(message);
});

// Query to fetch all Installed/instantiated chaincodes
app.get('/chaincodes', async function(req, res) {
	logger.debug('================ GET INSTALLED CHAINCODES ======================');
	logger.debug('installType'.padEnd(12) + ': ' + req.query.type);
	logger.debug('peer'.padEnd(12) + ': ' + req.query.peer);

	var peer = req.query.peer;
	var installType = req.query.type;

	let message = await query.getInstalledChaincodes(peer, null, 'installed', req.query.username, req.query.orgname)
	res.send(message);
});

//Query for Channel instantiated chaincodes
app.get('/channels/:channelName/chaincodes', async function(req, res) {
	logger.debug('================ GET INSTANTIATED CHAINCODES ======================');
	logger.debug('channelName'.padEnd(12) + ': ' + req.params.channelName);
	logger.debug('peer'.padEnd(12) + ': ' + req.query.peer);

	let peer = req.query.peer;

	let message = await query.getInstalledChaincodes(peer, req.params.channelName, 'instantiated', req.query.username, req.query.orgname);
	res.send(message);
});

//Query for Organizations
app.all('/orgs', async function(req, res) {
	logger.debug('================ GET ORGANIZATIONS ======================');
	logger.debug('End point : /orgs');

	res.json(orgs);
});
