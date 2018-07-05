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
var log4js = require('log4js');
var logger = log4js.getLogger('Helper');
logger.setLevel('DEBUG');

var path = require('path');
var util = require('util');
var copService = require('fabric-ca-client');

var hfc = require('fabric-client');
hfc.setLogger(logger);
var ORGS = hfc.getConfigSetting('network-config'); // KM --- WHAT IS THIS?

var clients = {};
var channels = {};
var caClients = {};

var sleep = async function (sleep_time_ms) {
	return new Promise(resolve => setTimeout(resolve, sleep_time_ms));
}

async function getClientForOrg (userorg, username) {
	logger.debug('getClientForOrg - ****** START %s %s', userorg, username)
	
	// Get a fabric client loaded with a connection profile for this org
	let config = '-connection-profile-path';
	let client = hfc.loadFromConfig(hfc.getConfigSetting('network'+config));
	client.loadFromConfig(hfc.getConfigSetting(userorg+config));
	logger.info('client loaded from config');

	// Create the state store and the crypto store 
	await client.initCredentialStores();

	// The client must be configured with a userContext before it can be used
	if(username) {
		let user = await client.getUserContext(username, true);
		if(!user) {
			throw new Error(util.format('User was not found :', username));
		} else {
			logger.debug('User %s was found to be registered and enrolled', username);
		}
	}
	logger.debug('getClientForOrg - ****** END %s %s \n', userorg, username)

	return client;
}

var getRegisteredUser = async function(username, userOrg, isJson) {
	try {
		
		// Get a fabric client
		var client = await getClientForOrg(userOrg);
		logger.debug('Successfully initialized the credential stores');

		// Check to see if the user is already enrolled
		var user = await client.getUserContext(username, true);
		if (user && user.isEnrolled()) {
			logger.info('Successfully loaded member from persistence');
		} else {
			// user was not enrolled, so we will need an admin user object to register
			logger.info('User %s was not enrolled, so we will need an admin user object to register', username);
			var admins = hfc.getConfigSetting('admins');
			let adminUserObj = await client.setUserContext({username: admins[0].username, password: admins[0].secret});
			if(adminUserObj.getAffiliation() != userOrg.toLowerCase()){
				logger.info('Admin affiliation not registered. Registering now.');
				adminUserObj.setAffiliation(userOrg.toLowerCase());
				adminUserObj.setRoles(['peer','orderer','client','user']);
				adminUserObj = await client.setUserContext(adminUserObj);
			}
			logger.info('Admin User: %s', adminUserObj);

			// Register and enroll the user
			let caClient = client.getCertificateAuthority();
			let affiliation = userOrg.toLowerCase() + '.department1';
			// Check if organization exists
			const affiliationService = caClient.newAffiliationService();
			const registeredAffiliations = await affiliationService.getAll(adminUserObj);
			if(!registeredAffiliations.result.affiliations.some(x => x.name == userOrg.toLowerCase())){
				logger.info('Register the new affiliation: %s ', affiliation);
				await affiliationService.create({name: affiliation, force: true}, adminUserObj);
			}

			let secret = await caClient.register({
				enrollmentID: username,
				enrollmentSecret: null,
				role: 'user',
				affiliation: affiliation
			}, adminUserObj);
			logger.debug('Successfully got the secret for user %s - %s',username, secret);

			user = await client.setUserContext({username:username, password:secret});
			user.setAffiliation(affiliation);
			user.setRoles(['client']);
			user._enrollmentSecret = secret.toString();
			user = await client.setUserContext(user);
			logger.info('Successfully enrolled username and setUserContext on the client object: %s', user);
		}
		if(user && user.isEnrolled) {
			if (isJson && isJson === true) {
				var response = {
					success: true,
					secret: user._enrollmentSecret,
					message: username + ' enrolled Successfully',
				};
				return response;
			}
		} else {
			throw new Error('User was not enrolled ');
		}
	} catch(error) {
		let message = 'Failed to register the username ' + username + ' for organization ' + userOrg + ' with error: ' + error.toString();
		logger.error(message);
		var response = {
			success: false,
			message: message,
		};
		return response;
	}
};

var setupChaincodeDeploy = function() {
	process.env.GOPATH = path.join(__dirname, hfc.getConfigSetting('CC_SRC_PATH'));
};

var getLogger = function(moduleName) {
	var logger = log4js.getLogger(moduleName);
	logger.setLevel('DEBUG');
	return logger;
};

function validateRequest(fields, expectedFields){

	// default response
	var response = {
		success: true,
		message: 'Missing or Invalid in the request:'
	};

	// loop through the request and check for the expected fields
	if (expectedFields && expectedFields.length > 0) {
		for (var i = 0, len = expectedFields.length; i < len; i++) {
			if(!fields[expectedFields[i]]){
				response.message += ' ' + expectedFields[i];
				response.success = false;
			}
			logger.debug(expectedFields[i].padEnd(12) + ': ' + fields[expectedFields[i]]);
		}
	} else {
		logger.debug('No request data needed.');
	}

	return response;
}


exports.getLogger = getLogger;
exports.validateRequest = validateRequest;
exports.getClientForOrg = getClientForOrg;
exports.setupChaincodeDeploy = setupChaincodeDeploy;
exports.getRegisteredUser = getRegisteredUser;
