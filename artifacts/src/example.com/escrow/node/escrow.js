/*
# Copyright IBM Corp. All Rights Reserved.
#
# SPDX-License-Identifier: Apache-2.0
*/

const shim = require('fabric-shim');
const util = require('util');

var Chaincode = class {

  // Initialize the chaincode
  async Init(stub) {
    console.info('========= escrow chaincode Init =========');
    let ret = stub.getFunctionAndParameters();
    console.info(ret);

    // init does nothing
    return shim.success();
  }

  async Invoke(stub) {
    console.info('========= escrow chaincode Invoke =========');
    let ret = stub.getFunctionAndParameters();
    console.info(ret);
    let method = this[ret.fcn];
    if (!method) {
      console.error('no method of name:' + ret.fcn + ' found');
      return shim.error('no method of name:' + ret.fcn + ' found');
    }

    console.info('Calling method : ' + ret.fcn);
    try {
      let payload = await method(this, stub, ret.params);
      return shim.success(payload);
    } catch (err) {
      console.log(err);
      return shim.error(err);
    }
  }

  async getIntValue(thisInstance, stub, args){
    
    let value = NaN;
    if (args.length == 2) {
      // Get the key and default value
      let key = args[0].toString();
      let defaultValue = parseInt(args[1]);

      // Get the actual value
      let state = await stub.getState(key);
      value = (!state) ? NaN : parseInt(state.toString());
      value = (typeof value == 'number' && value >= 0) ? value: defaultValue;
    }
    return value;
  }

  async register(thisInstance, stub, args){
    console.info('--------- escrow chaincode register ---------');

    let creator = stub.getCreator();
    let mspid = creator.mspid;
    let jsonResp = {};
    jsonResp.success = false;

    // Make sure the msp is registered
    let ownerKey = 'registeredusers';
    let ownerState = await stub.getState(ownerKey);
    let owners = (!ownerState || ownerState.toString().length == 0) ? [mspid] : ownerState.toString().split('|');
    
    await stub.putState(ownerKey, Buffer.from(owners.join('|').toString()));
    jsonResp.success = true;

    return Buffer.from(JSON.stringify(jsonResp));
  }

  async create(thisInstance, stub, args) {
    console.info('--------- escrow chaincode create ---------');
    if (args.length < 3) {
      throw new Error('Incorrect number of arguments. Expecting 3');
    }

    // Create default values
    let nfsq = 'Org1MSP';
    let jsonResp = {};
    let type = args[0];
    let name = args[1];
    let amount = parseInt(args[2]);
    let reservedAmount = 0;
    let price = 0;
    let creator = stub.getCreator();
    let mspid = creator.mspid;
    jsonResp.success = false;

    // Create item and sum key
    let itemKey = type + '_' + name;
    let sumKey = itemKey + '_' + mspid;
    let owners = [mspid];
    let batch = 1;

    if (type != 'item' && type != 'money') {
      throw new Error('Type error: args[0] must be from {name, money}');
    }
    
    if (!name) {
      throw new Error('Name error: args[1] must be specified');
    }

    if (typeof amount !== 'number' || amount < 0) {
      throw new Error('Amount error: Expecting positive integer values for args[2]');
    }

    // NFSQ can create items and other Orgs can create money.
    if (type == 'item' && mspid != nfsq){
      throw new Error('Users from your organization cannot create ' + type);
    }

    if (type == 'item'){

      // Get the price 
      if (args.length < 4){
        throw new Error('Incorrect number of arguments. Expecting 4');
      }else {
        price = parseInt(args[3]);
        if (typeof price !== 'number' || price < 0){
          throw new Error('Price error: Expecting positive integer values for args[3]');
        }
      }

      // Get the batch number
      let batchState = await stub.getState(itemKey);
      batch = (!batchState) ? NaN : parseInt(batchState.toString());
      batch = (typeof batch == 'number' && batch > 0) ? batch + 1 : 1;
      
    }

    // Get the batch specific keys
    let stateKey = itemKey + '_' + batch + '_' + mspid;
    let priceKey = itemKey + '_' + batch + '_' + 'price';
    let ownerKey = itemKey + '_' + batch + '_' + 'owners';
    let reservedKey = stateKey + '_' + 'reserved';

    // Get the item sum
    let sumState = await stub.getState(sumKey);
    let oldSum = (!sumState) ? NaN : parseInt(sumState.toString());
    oldSum = (typeof oldSum == 'number' && oldSum > 0) ? oldSum : 0;
    let newSum = oldSum + amount;

    // Correct for money
    if (type == 'money'){

      // Get the owners list
      let ownerState = await stub.getState(ownerKey);
      owners = (!ownerState || ownerState.toString().length == 0) ? [mspid] : ownerState.toString().split('|');

      // Add the current mspid to the owners list
      if(owners.indexOf(mspid) == -1) {
        console.info(util.format('%s was not a previous owner of %s', mspid, itemKey));
        owners.push(mspid)
      }

      // The batch amount is the same as the sum
      amount = newSum;

      // Get the reserved amount
      let reservedState = await stub.getState(reservedKey);
      reservedAmount = (!reservedState) ? NaN : parseInt(reservedState.toString());
      reservedAmount = (typeof reservedAmount == 'number' && reservedAmount > 0) ? reservedAmount : 0;
      
    }

    // Output the intention
    console.info(util.format('Creation proposal by : %s', mspid));
    console.info(util.format('Creation proposal for: %s (%d at %d)', itemKey, amount, price));
    console.info(util.format('Creation proposal tot: %d => %d from batch %d (%s)', oldSum, newSum, batch, owners.join('|')));
    
    // Save the state data to the chain
    await stub.putState(itemKey, Buffer.from(batch.toString()));
    await stub.putState(sumKey, Buffer.from(newSum.toString()));
    await stub.putState(stateKey, Buffer.from(amount.toString()));
    await stub.putState(reservedKey, Buffer.from(reservedAmount.toString()));
    await stub.putState(priceKey, Buffer.from(price.toString()));
    await stub.putState(ownerKey, Buffer.from(owners.join('|').toString()));
    
    // Update the list of item or money names
    if (batch == 1){
      // get the current list
      let itemNameState = await stub.getState(type + 'Names');
      let itemNames = (!itemNameState || itemNameState.toString().length == 0) ? [] : itemNameState.toString().split('|');

      // Add the name to the list
      if(itemNames.indexOf(name) == -1) {
        console.info(util.format('The %s %s is added to list of names.', type, name));
        itemNames.push(name);
      }

      // push to the blockchain
      await stub.putState(type + 'Names', Buffer.from(itemNames.join('|').toString()));
    }

    jsonResp.success = true;
    jsonResp.batch = batch;
    jsonResp.sum = newSum;
    jsonResp.amount = parseInt(args[2]);
    jsonResp.reserved = reservedAmount;
    jsonResp.price = price;
    jsonResp.owners = owners.join('|');
    jsonResp.type = type;
    jsonResp.name = name;

    console.info(util.format('Creation response    : %s \n', JSON.stringify(jsonResp)));

    return Buffer.from(JSON.stringify(jsonResp));
  }

  async createPO(thisInstance, stub, args) {
    console.info('--------- escrow chaincode create PO ---------');
    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting at least 1 argument.');
    }

    // Create default values
    let status = 'ordered';
    let nfsq = 'Org1MSP';
    let jsonResp = {};
    let typeKey = 'purchaseorders';
    let creator = stub.getCreator();
    let mspid = creator.mspid;
    let validPO = true;
    let POTotal = 0;
    let details = [];

    // NFSQ can't submit POs.
    if (mspid == nfsq){
      throw new Error('Users from your organization cannot create purchase orders.');
    }

    // Get the PO ID
    let poIDState = await stub.getState(typeKey);
    let poID = (!poIDState) ? NaN : parseInt(poIDState.toString());
    poID = (typeof poID == 'number' && poID > 0) ? poID + 1 : 1;

    // Create basic keys
    let poKey       = typeKey + '_' + poID;
    let POStatusKey = poKey + '_' + 'status';
    let POTotalKey  = poKey + '_' + 'total';
    let POOwnerKey  = poKey + '_' + 'owner';

    // Loop through the individual items in the order 
    for (var i=0; i < args.length && validPO; i++){

      // Create default values
      let singleDetail = {}
      let itemOrder = JSON.parse(args[i].toString());
      let name = itemOrder.name.toString();
      let transferAmount = parseInt(itemOrder.amount);
      let itemKey   = 'item' + '_' + name;

      // Get the amount available in the batches
      let batches = [];
      let total = 0;
      let availableAmount = 0;
      let batchState = await stub.getState(itemKey);
      let batchMax = (!batchState) ? NaN : parseInt(batchState.toString());
      batchMax = (typeof batchMax == 'number' && batchMax > 0) ? batchMax: 0;

      // Loop through the individual batches until we have enough to fill the order 
      for(var j=1; j<=batchMax && availableAmount < transferAmount; j++){

        // Get the batch keys
        let batch = {};
        let stateKey = itemKey + '_' + j + '_' + nfsq;
        let reservedKey = stateKey + '_' + 'reserved';
        let priceKey = itemKey + '_' + j + '_' + 'price';

        // Get the batch values
        let amountState = await stub.getState(stateKey);
        let amount = (!amountState) ? NaN : parseInt(amountState.toString());
        let reservedAmount  = await thisInstance.getIntValue(thisInstance, stub, [reservedKey, 0]);
        let price  = await thisInstance.getIntValue(thisInstance, stub, [priceKey, 0]);
  
        if(typeof amount == 'number' && amount > reservedAmount){

          // Save the batch information
          batch.batch = j;
          batch.amount = (transferAmount - availableAmount < amount - reservedAmount) ? transferAmount - availableAmount : amount - reservedAmount;
          batch.price = price;
          batch.status = status;

          // Update the total and amount
          total += parseInt(price) * parseInt(batch.amount);
          POTotal += total;
          availableAmount += batch.amount;

          // Push the batch to the list of batches
          batches.push(batch);
          console.info(util.format('Reserving %s: %s', name, JSON.stringify(batch)));
        }
      }

      // add the item details to the purchase order
      if(availableAmount == transferAmount){
        singleDetail.name = name;
        singleDetail.amount = availableAmount;
        singleDetail.total = total;
        singleDetail.batches = batches;
        details.push(singleDetail);
      } else {
        validPO = false;
        jsonResp.success = false;
        jsonResp.status = 'failed';
        jsonResp.message = (jsonResp.message ? jsonResp.message : 'Stopped processing due to insufficient stock of ' + name);
      }
    }
    console.info(util.format('Purchase order details: %s', JSON.stringify(details)));

    // Check if the creator has enough money
    let moneyKey        = 'money_RMB_1_' + mspid;
    let availableMoney  = await thisInstance.getIntValue(thisInstance, stub, [moneyKey, 0]);
    console.info(util.format('Available RMB balance: %d', availableMoney));
    if (POTotal > availableMoney){
      jsonResp.message = (jsonResp.message ? jsonResp.message + ' | ' : '') + 'Insufficient funds: RMB ' + POTotal + ' > RMB ' + availableMoney;
      validPO = false;
    }

    if (validPO){
      // Update the individual items
      for (var i=0; i < details.length; i++){

        let nameKey   = poKey + '_' + i + '_' + 'name';
        let amountKey = poKey + '_' + i + '_' + 'amount';
        let totalKey  = poKey + '_' + i + '_' + 'total';
        let batchKey  = poKey + '_' + i + '_' + 'batches';
        let batchIDs = [];

        // Update the individual batches
        for(var j=0; j< details[i].batches.length; j++){
          let batch = details[i].batches[j];

          let batchStatusKey    = poKey + '_' + i + '_' + batch.batch + '_' + 'status';
          let batchAmountKey    = poKey + '_' + i + '_' + batch.batch + '_' + 'amount';
          let batchDeliveredKey = poKey + '_' + i + '_' + batch.batch + '_' + 'delivered';
          let batchReceivedKey  = poKey + '_' + i + '_' + batch.batch + '_' + 'received';
          let reservedStateKey  = 'item' + '_' + details[i].name + '_' + batch.batch + '_' + nfsq + '_' + 'reserved';
          batchIDs.push(batch.batch);
          console.info(util.format('Deliver keys : %s | %s | %s | %s', batchStatusKey, batchAmountKey, batchDeliveredKey, reservedStateKey));

          let oldReservedAmount  = await thisInstance.getIntValue(thisInstance, stub, [reservedStateKey, 0]);
          let newReservedAmount  = oldReservedAmount + parseInt(batch.amount);

          // Save the batch specific values
          await stub.putState(batchStatusKey, Buffer.from(status));
          await stub.putState(batchAmountKey, Buffer.from(batch.amount.toString()));
          await stub.putState(batchDeliveredKey, Buffer.from('0'));
          await stub.putState(batchReceivedKey, Buffer.from('0'));
          await stub.putState(reservedStateKey, Buffer.from(newReservedAmount.toString()));
        }

        // Save the item specific values
        await stub.putState(nameKey, Buffer.from(details[i].name.toString()));
        await stub.putState(amountKey, Buffer.from(details[i].amount.toString()));
        await stub.putState(totalKey, Buffer.from(details[i].total.toString()));
        await stub.putState(batchKey, Buffer.from(batchIDs));

      }

      // Save the purchase order specific values
      await stub.putState(typeKey, Buffer.from(poID.toString()));
      await stub.putState(poKey, Buffer.from(details.length.toString()));
      await stub.putState(POStatusKey, Buffer.from(status));
      await stub.putState(POTotalKey, Buffer.from(POTotal.toString()));
      await stub.putState(POOwnerKey, Buffer.from(mspid.toString()));

      jsonResp.success = validPO;
      jsonResp.po      = poID;
      jsonResp.total   = POTotal;
      jsonResp.status  = status;
      jsonResp.details = details;
      jsonResp.message = 'Successfully created purchase order ' + poID;

    }

    console.info(util.format('Creation response    : %s \n', JSON.stringify(jsonResp)));

    return Buffer.from(JSON.stringify(jsonResp));
  }
  
  async deliver(thisInstance, stub, args){
    console.info('--------- escrow chaincode deliver PO ---------');
    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting at least 1 argument.');
    }

    // Create default values
    let nfsq = 'Org1MSP';
    let jsonResp = {success: false};
    let typeKey = 'purchaseorders';
    let poID = parseInt(args[0]);
    let creator = stub.getCreator();
    let mspid = creator.mspid;
    let validPO = true;
    let details = args;
    let message = '';

    // Only NFSQ can deliver purchase orders
    if (mspid != nfsq){
      throw new Error('Users from your organization cannot deliver purchase orders.');
    }

    // Get the original PO
    let queryArgs = [];
    queryArgs.push('false');
    queryArgs.push(poID);
    let originalPOBuffer = await thisInstance.queryPO(thisInstance, stub, queryArgs);
    let originalPO = JSON.parse(originalPOBuffer.toString());

    // Get the itemID for each item
    let poItemIDs = {};
    let poKey = typeKey + '_' + poID;
    let poState = await stub.getState(poKey);
    let poMax = (!poState) ? NaN : parseInt(poState.toString());
    poMax = (typeof poMax == 'number' && poMax > 0) ? poMax: 0;
    for (var i=0; i < poMax; i++){
      let nameKey   = poKey + '_' + i + '_' + 'name';
      let nameState = await stub.getState(nameKey);
      poItemIDs[nameState.toString()] = i;
    }

    // Get the recipient of the PO
    let POOwnerKey  = poKey + '_' + 'owner';
    let POOwnerState = await stub.getState(POOwnerKey);
    let recipient = POOwnerState.toString();

    // TODO: something if there are no items

    // Loop through the individual delivery items
    for (var i=1; i < details.length && validPO; i++){

      // Create default values
      let itemOrder = JSON.parse(details[i].toString());
      let name = itemOrder.name.toString();
      let batches = itemOrder.batches;

      // Loop through the batches of the item
      for(var j=0; j < batches.length; j++){

        // get the delivery amount for each batch
        let batchID       = parseInt(batches[j].batch);
        let deliverAmount = parseInt(batches[j].amount);
        let batchStatusKey    = poKey + '_' + poItemIDs[name] + '_' + batchID + '_' + 'status';
        let batchAmountKey    = poKey + '_' + poItemIDs[name] + '_' + batchID + '_' + 'amount';
        let batchDeliveredKey = poKey + '_' + poItemIDs[name] + '_' + batchID + '_' + 'delivered';
        let reservedStateKey  ='item' + '_' + name            + '_' + batchID + '_' + mspid + '_' + 'reserved';
        let stateKey          ='item' + '_' + name            + '_' + batchID + '_' + mspid;

        // You cannot deliver items that have already been received.
        let status = await stub.getState(batchStatusKey);
        if(status.toString() == 'received' || status.toString() == 'delivered'){
            // Do not transfer the surplus amount
            message += '[ ERROR: ' + name + '(' +  batchID + ') already ' + status.toString() + '. '; 
            message += 'Nothing was transferred. ]'; 
            continue;
        }

        // Calculate the delivery amounts
        let batchAmount     = await thisInstance.getIntValue(thisInstance, stub, [batchAmountKey, 0]);
        let deliveredAmount = await thisInstance.getIntValue(thisInstance, stub, [batchDeliveredKey, 0]);
        let reservedAmount  = await thisInstance.getIntValue(thisInstance, stub, [reservedStateKey, 0]);
        let stateAmount     = await thisInstance.getIntValue(thisInstance, stub, [stateKey, 0]);

        let transferAmount       = (deliverAmount <= batchAmount - deliveredAmount) ? deliverAmount : batchAmount - deliveredAmount;
        let amountFromReserved    = (transferAmount <= reservedAmount) ? transferAmount : reservedAmount;
        let amountNotFromReserved = transferAmount - amountFromReserved;
        let surplusAmount         = deliverAmount - transferAmount;

        console.info(util.format('Deliver for: %d) name = %s, batch = %d, amount = %d', parseInt(poItemIDs[name]), name, batchID, deliverAmount));
        console.info(util.format('Deliver values : deliver = ( %d | %d ) | reserve = %d || state = %d | transfer = ( %d = %d + %d ) | surplus = %d', 
                                  batchAmount, deliveredAmount, reservedAmount, 
                                  stateAmount, transferAmount, amountFromReserved, amountNotFromReserved, surplusAmount));

        if(stateAmount - reservedAmount >= amountNotFromReserved) {
          // Make the reserves available for transfer
          let reservedRemainder = reservedAmount - amountFromReserved;
          await stub.putState(reservedStateKey, Buffer.from(reservedRemainder.toString()));

          // transfer items
          let transferArgs = [];
          transferArgs[0] = 'item';
          transferArgs[1] = name;
          transferArgs[2] = transferAmount;
          transferArgs[3] = recipient;
          transferArgs[4] = batchID;
          console.info(util.format('Transfer args: %s | note actual recipient: %s', JSON.stringify({args: transferArgs}), recipient));
          let transferResponseBuffer = await thisInstance.transfer(thisInstance, stub, transferArgs, true);

          let transferResponse = JSON.parse(transferResponseBuffer.toString());
          
          if (transferResponse.success == true){

            // update the status
            deliveredAmount += transferAmount;
            status = (deliveredAmount == batchAmount) ? 'delivered' : 'partial';
            await stub.putState(batchStatusKey, Buffer.from(status.toString()));
            await stub.putState(batchDeliveredKey, Buffer.from(deliveredAmount.toString()));
    
            // update the original PO
            jsonResp.success = true;
            let updateRecorded = false;
            for (var k=0; k < originalPO.details.length && !updateRecorded; k++ ){
              if(originalPO.details[k].name == name) {
                for (var l=0; l < originalPO.details[k].batches.length && !updateRecorded; l++){
                  if(originalPO.details[k].batches[l].batch == batchID) {
                    originalPO.details[k].batches[l].status = status;
                    updateRecorded = true;
                    break;
                  }
                }
              }
            }

            if(surplusAmount > 0) {
              // Do not transfer the surplus amount
              message += '[ ERROR: ' + name + '(' +  batchID + ') - ' + deliverAmount + ' exceeds available stock. '; 
              message += 'Only ' + amountFromReserved  + ' was transferred. ]'; 
            }
          } else {
            // Undo the reserve amount change
            await stub.putState(reservedStateKey, Buffer.from(reservedAmount.toString()));

            // Add a message
            message += '[ ERROR: ' + name + '(' +  batchID + ') - transfer failed. '; 
            message += 'Nothing was transferred. ]'; 
          }
        } else {
          message += '[ ERROR: ' + name + '(' +  batchID + ') - ' + deliverAmount + ' exceeds available stock. '; 
          message += 'Nothing was transferred. ]'; 
        }
      }
    }

    // update the status 
    let POStatusKey   = poKey + '_' + 'status';
    let POStatusState = await stub.getState(POStatusKey);
    let POStatus      = (!POStatusState) ? '' : POStatusState.toString();

    let allCreated = true;
    let allDelivered = true;
    let allReceived = true;
    for (var k=0; k < originalPO.details.length; k++ ){
      for (var l=0; l < originalPO.details[k].batches.length; l++){
        allReceived  = (allReceived  && originalPO.details[k].batches[l].status == 'received');
        allDelivered = (allDelivered && (originalPO.details[k].batches[l].status == 'received' || originalPO.details[k].batches[l].status == 'delivered'));
        allCreated   = (allCreated   && originalPO.details[k].batches[l].status == 'ordered');
      }
    }
    originalPO.status = allReceived ? 'received' : ( allDelivered ? 'delivered' : (allCreated ? 'ordered' : 'partial'));

    if(POStatus != originalPO.status) {
      await stub.putState(POStatusKey, Buffer.from(originalPO.status));
    }

    if(jsonResp.success == true) {
      jsonResp = originalPO;
      jsonResp.success = true;
    }

    if (message.length > 0) {
      jsonResp.message = message;
    }

    console.info(util.format('Delivery response    : %s \n', JSON.stringify(jsonResp)));

    return Buffer.from(JSON.stringify(jsonResp));

  }

  async receive(thisInstance, stub, args){
    console.info('--------- escrow chaincode receive PO ---------');
    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting at least 1 argument.');
    }

    // Create default values
    let nfsq = 'Org1MSP';
    let jsonResp = {success: false};
    let typeKey = 'purchaseorders';
    let poID = parseInt(args[0]);
    let creator = stub.getCreator();
    let mspid = creator.mspid;
    let validPO = true;
    let details = args;
    let message = '';

    // NFSQ cannot receive purchase orders
    if (mspid == nfsq){
      throw new Error('Users from your organization cannot receive purchase orders.');
    }

    // Get the original PO
    let queryArgs = [];
    queryArgs.push('false');
    queryArgs.push(poID);
    let originalPOBuffer = await thisInstance.queryPO(thisInstance, stub, queryArgs);
    let originalPO = JSON.parse(originalPOBuffer.toString());
    
    // Get the itemID for each item
    let poItemIDs = {};
    let poKey = typeKey + '_' + poID;
    let poState = await stub.getState(poKey);
    let poMax = (!poState) ? NaN : parseInt(poState.toString());
    poMax = (typeof poMax == 'number' && poMax > 0) ? poMax: 0;
    for (var i=0; i < poMax; i++){
      let nameKey   = poKey + '_' + i + '_' + 'name';
      let nameState = await stub.getState(nameKey);
      poItemIDs[nameState.toString()] = i;
    }

    // Loop through the individual delivery items
    for (var i=1; i < details.length && validPO; i++){

      // Create default values
      let itemOrder = JSON.parse(details[i].toString());
      let name = itemOrder.name.toString();
      let batches = itemOrder.batches;

      // Loop through the batches of the item
      for(var j=0; j < batches.length; j++){

        // get the delivery amount for each batch
        let batchID       = parseInt(batches[j].batch);
        let receiveAmount = parseInt(batches[j].amount);
        let batchStatusKey    = poKey + '_' + poItemIDs[name] + '_' + batchID + '_' + 'status';
        let batchAmountKey    = poKey + '_' + poItemIDs[name] + '_' + batchID + '_' + 'amount';
        let batchDeliveredKey = poKey + '_' + poItemIDs[name] + '_' + batchID + '_' + 'delivered';
        let batchReceivedKey  = poKey + '_' + poItemIDs[name] + '_' + batchID + '_' + 'received';

        // You cannot receive items that have already been received.
        let status = await stub.getState(batchStatusKey);
        if(status.toString() == 'received' && receiveAmount > 0){
            message += '[ ERROR: ' + name + '(' +  batchID + ') already received. '; 
            message += 'No items were transferred. ]'; 
            continue;
        }

        // Calculate the delivery amounts
        let batchAmount     = await thisInstance.getIntValue(thisInstance, stub, [batchAmountKey, 0]);
        let deliveredAmount = await thisInstance.getIntValue(thisInstance, stub, [batchDeliveredKey, 0]);
        let oldReceivedAmount  = await thisInstance.getIntValue(thisInstance, stub, [batchReceivedKey, 0]);

        let amountToReceive = (receiveAmount <= deliveredAmount - oldReceivedAmount) ? receiveAmount : deliveredAmount - oldReceivedAmount;
        let newReceivedAmount =  oldReceivedAmount + amountToReceive;

        console.info(util.format('Receive for    : %d) name = %s, batch = %d, amount = %d', parseInt(poItemIDs[name]), name, batchID, receiveAmount));
        console.info(util.format('Receive values : %d | %d | %d > %d', batchAmount, deliveredAmount, oldReceivedAmount, newReceivedAmount));

        // update the receive amount
        if (amountToReceive > 0){
          await stub.putState(batchReceivedKey, Buffer.from(newReceivedAmount.toString()));
          jsonResp.success = true;

          // update the status
          if (newReceivedAmount == batchAmount){
            // update the status
            await stub.putState(batchStatusKey, Buffer.from('received'));
            // update the original PO
            let updateRecorded = false;
            for (var k=0; k < originalPO.details.length && !updateRecorded; k++ ){
              if(originalPO.details[k].name == name) {
                for (var l=0; l < originalPO.details[k].batches.length && !updateRecorded; l++){
                  if(originalPO.details[k].batches[l].batch == batchID) {
                    originalPO.details[k].batches[l].status = 'received';
                    updateRecorded = true;
                    break;
                  }
                }
              }
            }            
          }
        }

        // send a message
        if (receiveAmount > amountToReceive){
            // Do not transfer the surplus amount
            message += '[ ERROR: ' + name + '(' +  batchID + ') ' + receiveAmount + ' exceeds the purchase order amount. '; 
            message += 'Only receipt of ' + amountToReceive + ' was recorded. ]'; 
        }
      }
    }

    // update the status 
    let POStatusKey   = poKey + '_' + 'status';
    let POStatusState = await stub.getState(POStatusKey);
    let POStatus      = (!POStatusState) ? '' : POStatusState.toString();

    let allReceived = true;
    for (var k=0; k < originalPO.details.length && allReceived; k++ ){
      for (var l=0; l < originalPO.details[k].batches.length && allReceived; l++){
        allReceived  = (allReceived  && originalPO.details[k].batches[l].status == 'received');
      }
    }
    originalPO.status = allReceived ? 'received' : originalPO.status;
    if(POStatus != originalPO.status) {
      await stub.putState(POStatusKey, Buffer.from(originalPO.status));

      // After receiving all the goods, transfer the items
      let transferArgs = [];
      transferArgs[0] = 'money';
      transferArgs[1] = 'RMB';
      transferArgs[2] = originalPO.total;
      transferArgs[3] = nfsq;
      transferArgs[4] = 1;
      console.info(util.format('Transfer payment args: %s ', JSON.stringify({args: transferArgs})));
      await thisInstance.transfer(thisInstance, stub, transferArgs, true);
    }

    // Create the json response
    if(jsonResp.success == true) {
      jsonResp = originalPO;
      jsonResp.success = true;
    }
    if (message.length > 0) {
      jsonResp.message = message;
    }

    console.info(util.format('Receive response    : %s \n', JSON.stringify(jsonResp)));

    return Buffer.from(JSON.stringify(jsonResp));

  }

  async transfer(thisInstance, stub, args, ignoreReserved = false) {
    console.info('--------- escrow chaincode transfer ---------');
    if (args.length < 4) {
      throw new Error('Incorrect number of arguments. Expecting at least 4.');
    }

    let jsonResp = {success: false};
    let type = args[0];
    let name = args[1];
    let transferAmount = parseInt(args[2]);
    let creator = stub.getCreator();
    let mspid = creator.mspid;
    let recipient = args[3];
    jsonResp.type = type;
    jsonResp.name = name;
    jsonResp.mspid = mspid;

    // Get the number of batches
    let itemKey = type + '_' + name;
    let batchState = await stub.getState(itemKey);
    let batchMax = (!batchState) ? NaN : parseInt(batchState.toString());
    batchMax = (typeof batchMax == 'number' && batchMax > 0) ? batchMax : 0;
    let batchMin = 1;
    
    // Check if the user is querying a specific batch
    if (args.length  == 5){
      batchMin = parseInt(args[4]);
      if (typeof batchMin !== 'number' || batchMin <= 0) {
        throw new Error('Batch error: Expecting positive integer values for args[2]');
      }  
      batchMax = batchMin;
      console.info(util.format('Transfer amount will be taken from batch: %d', batchMax));
    }

    // Get the amount available in the batches
    let batches = [];
    let availableAmount = 0;
    for(var i=batchMin; i<=batchMax && availableAmount < transferAmount; i++){
      console.info(util.format('Checking batch %d of %s', i, mspid));

      let batch = {};
      let stateKey = itemKey + '_' + i + '_' + mspid;
      let reservedKey = stateKey + '_' + 'reserved';
      let amountState = await stub.getState(stateKey);
      let amount = (!amountState) ? NaN : parseInt(amountState.toString());
      let reservedState = await stub.getState(reservedKey);
      let reservedAmount = (!reservedState) ? NaN : parseInt(reservedState.toString());
      reservedAmount = (typeof reservedAmount == 'number' && reservedAmount > 0 && !ignoreReserved) ? reservedAmount : 0;

      if(typeof amount == 'number' && amount > reservedAmount){
        // Save the batch information
        batch.batch = i;
        batch.amount = (transferAmount - availableAmount < amount - reservedAmount) ? transferAmount - availableAmount : amount - reservedAmount;
        batch.remainder = amount - batch.amount;
        availableAmount += batch.amount;
        batches.push(batch);
      }
    }

    console.info(util.format('Transfer proposal : available amount is %d', availableAmount));

    // transfer the amount
    if (availableAmount == transferAmount) {

      // Get the sums 
      let sumStateSender = await stub.getState(itemKey + '_' + mspid);
      let oldSumSender = (!sumStateSender) ? NaN : parseInt(sumStateSender.toString());
      oldSumSender = (typeof oldSumSender == 'number' && oldSumSender > 0) ? oldSumSender : 0;
      let sumStateRecipient = await stub.getState(itemKey + '_' + recipient);
      let oldSumRecipient = (!sumStateRecipient) ? NaN : parseInt(sumStateRecipient.toString());
      oldSumRecipient = (typeof oldSumRecipient == 'number' && oldSumRecipient > 0) ? oldSumRecipient : 0;

      // transfer the items
      for(var i=0; i<batches.length; i++){

        let batchKey = itemKey + '_' + batches[i].batch;
        let senderStateKey = batchKey + '_' + mspid;
        let recipientStateKey = batchKey + '_' + recipient;
        let ownerKey = batchKey + '_' + 'owners';

        console.info(util.format('Transferring %d from %s', batches[i].amount, batchKey));

        // take the items from the sender
        await stub.putState(senderStateKey, Buffer.from(batches[i].remainder.toString()));

        // give the items to the recipient
        let oldAmountState = await stub.getState(recipientStateKey);
        let oldAmount = (!oldAmountState) ? NaN : parseInt(oldAmountState.toString());
        oldAmount = (typeof oldAmount == 'number' && oldAmount > 0) ? oldAmount: 0;
        let newAmount = oldAmount + batches[i].amount;
        await stub.putState(recipientStateKey, Buffer.from(newAmount.toString()));

        console.info(util.format('Transferring %d to %s', oldAmount, newAmount));

        // Make sure the recipient is logged as an owner
        let ownerState = await stub.getState(ownerKey);
        let owners = ownerState.toString().split('|');

        if(owners.indexOf(recipient) == -1) {
          console.info(util.format('%s was not a previous owner of %s', recipient, batchKey));
          owners.push(recipient)
          await stub.putState(ownerKey, Buffer.from(owners.join('|').toString()));
        }
      }

      // Update the sums
      let newSumSender = oldSumSender - transferAmount;
      let newSumRecipient = oldSumRecipient + transferAmount;
      await stub.putState(itemKey + '_' + mspid, Buffer.from(newSumSender.toString()));
      await stub.putState(itemKey + '_' + recipient, Buffer.from(newSumRecipient.toString()));

      jsonResp.success = true;
      jsonResp.batches = batches;

    } else {
      jsonResp.success = false;
      jsonResp.message = 'only ' + availableAmount + ' available';
    }

    // Output the intention
    console.info(util.format('Transfer proposal by : %s to %s', mspid, recipient));
    console.info(util.format('Transfer proposal for: %s (%d from batches %d-%d)', itemKey, transferAmount, batchMin, batchMax));
    console.info(util.format('Transfer response    : %s \n', JSON.stringify(jsonResp)));

    return Buffer.from(JSON.stringify(jsonResp));
  }

  async query(thisInstance, stub, args) {
    console.info('--------- escrow chaincode query ---------');
    if (args.length < 2) {
      throw new Error('Incorrect number of arguments. Expecting 2');
    }

    let jsonResp = {};
    let type = args[0];
    let name = args[1];
    let creator = stub.getCreator();
    let mspid = creator.mspid;
    jsonResp.success = false;

    if (type != 'item' && type != 'money' && type != 'po') {
      throw new Error('Type error: args[0] must be from {name, money, po}');
    }
    
    if (!name) {
      throw new Error('Name error: args[1] must be specified');
    }

    // Get the number of batches
    let itemKey = type + '_' + name;
    let batchState = await stub.getState(itemKey);
    let batchMax = (!batchState) ? NaN : parseInt(batchState.toString());
    batchMax = (typeof batchMax == 'number' && batchMax > 0) ? batchMax: 0;
    let batchMin = 1;
    
    // Check if the user is querying a specific batch
    if (args.length  == 3){
      batchMin = parseInt(args[2]);
      if (typeof batchMin !== 'number' || batchMin <= 0) {
        throw new Error('Batch error: Expecting positive integer values for args[2]');
      }  
      batchMax = batchMin;
    }

    console.info(util.format('Query proposal by : %s', mspid));
    console.info(util.format('Query proposal for: %s %s (batch %d=>%d)', type, name, batchMin, batchMax));

    // Get the sum for this user
    let sumKey = itemKey + '_' + mspid;
    let sumState = await stub.getState(sumKey);
    let sum = (!sumState) ? NaN : parseInt(sumState.toString());
    sum = (typeof sum == 'number' && sum > 0) ? sum : 0;

    // Get the history per batch
    let batches = [];
    for(var i=batchMin; i<=batchMax; i++){
      let batch = {};

      // Get the batch number
      batch.batch = i;

      // Get the price 
      let priceKey = itemKey + '_' + i + '_' + 'price';      
      let priceState = await stub.getState(priceKey);
      batch.price = (!priceState) ? NaN : parseInt(priceState.toString());
      
      // Get the owners
      let ownerKey = itemKey + '_' + i + '_' + 'owners';
      let ownerState = await stub.getState(ownerKey);
      let owners = ownerState.toString().split('|');
      console.info(util.format('Query batch       : %s (%s)', batch.batch, owners.toString()));

      // Get the current amount
      let amount = [];
      let history = [];
      let transactionHistory = {};
      for(var j=0; j < owners.length; j++){
        let stateKey = itemKey + '_' + i + '_' + owners[j];
        let amountState = await stub.getState(stateKey);
        let amountValue = (!amountState) ? NaN : parseInt(amountState.toString());
        let amountInfo = {owner:owners[j], amount: amountValue};

        // Add the reserved amount if something is reserved
        let reservedKey = stateKey + '_' + 'reserved';
        let reservedState = await stub.getState(reservedKey);
        let reservedAmount = (!reservedState) ? NaN : parseInt(reservedState.toString());
        if(typeof reservedAmount == 'number' && reservedAmount > 0) {
          amountInfo.reserved = reservedAmount;
        }

        // Push the amount and owner information
        amount.push(amountInfo);
        
        // Find the history of this item
        let historyQI = await stub.getHistoryForKey(stateKey);
        let result = {done: false};
	      while (!result.done) {
          result = await historyQI.next();

          if(!(result.value.timestamp.seconds.low.toString() in transactionHistory)){
            // Add the item
            transactionHistory[result.value.timestamp.seconds.low.toString()] = {
              timestamp : result.value.timestamp.seconds.low, 
              amount: [ {owner:owners[j], amount: parseInt(result.value.value.toBuffer().toString())} ], 
              tx_id: result.value.tx_id.toString()
            };
          } else {
            // Add the owner to the transaction
            transactionHistory[result.value.timestamp.seconds.low.toString()].amount.push({owner:owners[j], amount: parseInt(result.value.value.toBuffer().toString())});
          }
        }
      }

      Object.keys(transactionHistory).sort().forEach( function(key, i) {
        console.info(util.format('Query Tx loop     : %s', JSON.stringify(transactionHistory[key])));
        history.push(transactionHistory[key]);
      });

      batch.amount = amount;
      batch.history = history;

      // Push this batch to the batches
      batches.push(batch);
    }

    jsonResp.success = true;
    jsonResp.type = type;
    jsonResp.name = name;
    jsonResp.mspid = mspid;
    jsonResp.sum = sum;
    jsonResp.batches = batches;

    console.info(util.format('Query response    : %s \n', JSON.stringify(jsonResp)));

    return Buffer.from(JSON.stringify(jsonResp));
  }

  async queryNAMES(thisInstance, stub, args) {
    console.info('--------- escrow chaincode query NAMES ---------');
    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting at least one');
    }

    let jsonResp = {};
    let nfsq = 'Org1MSP';
    let useOwner = args[0].toString();
    let types = ['item', 'money'];
    let creator = stub.getCreator();
    let mspid = (useOwner == true || useOwner == 'true') ? creator.mspid : nfsq;
    jsonResp.success = true;
    jsonResp.items = [];

    for (var i=0; i < types.length; i++) {
      let itemNameState = await stub.getState(types[i] + 'Names');
      let itemNames = (!itemNameState || itemNameState.toString().length == 0) ? [] : itemNameState.toString().split('|');

      for(var j=0;  j < itemNames.length; j++){
        let itemKey = types[i] + '_' + itemNames[j];
        let sumKey  = itemKey + '_' + mspid;
        let sum     = await thisInstance.getIntValue(thisInstance, stub, [sumKey, 0]);

        let item = {type: types[i] };
        item.details = {name: itemNames[j], amount: sum};

        if(types[i] == 'item'){
          let batch    = await thisInstance.getIntValue(thisInstance, stub, [itemKey, 1]);
          let priceKey = itemKey + '_' + batch + '_' + 'price';
          let price    = await thisInstance.getIntValue(thisInstance, stub, [priceKey, 0]);
          item.details = {name: itemNames[j], amount: sum, price: price};
        }
        
        if(sum > 0 ){
          jsonResp.items.push(item);
        }
      }
    }
    console.info(util.format('Query response    : %s \n', JSON.stringify(jsonResp)));

    return Buffer.from(JSON.stringify(jsonResp));
  }
  
  async queryPOALL(thisInstance, stub, args) {
    console.info('--------- escrow chaincode query PO ALL ---------');
    if (args.length < 1) {
      throw new Error('Incorrect number of arguments. Expecting at least one');
    }

    // Create default values
    let jsonResp = [];
    let typeKey = 'purchaseorders';
    let poMin = 1;
    let poMax = await thisInstance.getIntValue(thisInstance, stub, [typeKey, 0]);
    let useHistory = args[0].toString();
    useHistory = (useHistory == true || useHistory == 'true') ? 'true' : 'false';

    // filter for specific purchase orders
    if (args.length > 1) {
      poMin = parseInt(args[1]);
      if(poMin > 0 ){
        poMax = poMin;
      } else {
        poMin = 1;
      }
    }

    // Get the individual purchase orders
    for (var i=poMin; i <= poMax; i++){
      let queryArgs = [];
      queryArgs.push(useHistory);
      queryArgs.push(i);

      let queryResponseBuffer = await thisInstance.queryPO(thisInstance, stub, queryArgs);
      jsonResp.push(JSON.parse(queryResponseBuffer.toString()));
    }
    
    console.info(util.format('Query response    : %s \n', JSON.stringify(jsonResp)));

    return Buffer.from(JSON.stringify(jsonResp));
  }

  async queryPO(thisInstance, stub, args) {
    console.info('--------- escrow chaincode query PO ---------');
    if (args.length < 2) {
      throw new Error('Incorrect number of arguments. Expecting history and poID.');
    }

    // Create default values
    let typeKey = 'purchaseorders';
    let poID = parseInt(args[1]);
    let useHistory = args[0].toString();
    useHistory = (useHistory == true || useHistory == 'true') ? true : false;

    // General keys 
    let poKey       = typeKey + '_' + poID;
    let POStatusKey = poKey + '_' + 'status';
    let POTotalKey  = poKey + '_' + 'total';

    // Get the PO information
    let POStatusState     = await stub.getState(POStatusKey);
    let POStatus          = (!POStatusState) ? '' : POStatusState.toString();
    let numberOfItemsInPO = await thisInstance.getIntValue(thisInstance, stub, [poKey, 0]);
    let POTotal           = await thisInstance.getIntValue(thisInstance, stub, [POTotalKey, 0]);

    // Build the response
    let jsonResp = {};
    jsonResp.type    = 'po';
    jsonResp.po      = poID;
    jsonResp.status  = POStatus;
    jsonResp.total   = POTotal;
    jsonResp.details = [];

    // Get the individual items
    for (var i=0; i < numberOfItemsInPO; i++){

      let amountKey = poKey + '_' + i + '_' + 'amount';
      let totalKey  = poKey + '_' + i + '_' + 'total';
      let batchKey  = poKey + '_' + i + '_' + 'batches';
      let nameKey   = poKey + '_' + i + '_' + 'name';

      let amount    = await thisInstance.getIntValue(thisInstance, stub, [amountKey, 0]);
      let total     = await thisInstance.getIntValue(thisInstance, stub, [totalKey, 0]);
      let batchIDs  = await stub.getState(batchKey);
      let nameState = await stub.getState(nameKey);
      let name      = (!nameState) ? '' : nameState.toString();
      let batches   = [];

      // Update the individual batches
      for(var j=0; j< batchIDs.length; j++){

        let batchStatusKey    = poKey + '_' + i + '_' + batchIDs[j] + '_' + 'status';
        let batchAmountKey    = poKey + '_' + i + '_' + batchIDs[j] + '_' + 'amount';
        let batchDeliveredKey = poKey + '_' + i + '_' + batchIDs[j] + '_' + 'delivered';
        let batchReceivedKey  = poKey + '_' + i + '_' + batchIDs[j] + '_' + 'received';
        let batchPriceKey     = 'item' + '_' + name + '_' + batchIDs[j] + '_' + 'price';
        console.info(util.format('Query keys : %s | %s | %s | %s', batchStatusKey, batchAmountKey, batchDeliveredKey, batchPriceKey));

        let batchID        = batchIDs[j];
        let batchPrice     = await thisInstance.getIntValue(thisInstance, stub, [batchPriceKey, 0]);
        let batchAmount    = await thisInstance.getIntValue(thisInstance, stub, [batchAmountKey, 0]);
        let batchDelivered = await thisInstance.getIntValue(thisInstance, stub, [batchDeliveredKey, 0]);
        let batchReceived  = await thisInstance.getIntValue(thisInstance, stub, [batchReceivedKey, 0]);
        let batchPending   = batchAmount - batchDelivered;
        let batchStatusState = await stub.getState(batchStatusKey);
        let batchStatus      = (!batchStatusState) ? '' : batchStatusState.toString();

        // Loop through the history
        let history = [];
        let transactionHistory = [];
        let historyKeys = [batchStatusKey, batchDeliveredKey, batchReceivedKey];
        for (var k=0; (useHistory == true) && k < 3; k++){
          // Find the history of this item
          let historyQI = await stub.getHistoryForKey(historyKeys[k]);
          let result = {done: false};
          while (!result.done) {
            result = await historyQI.next();

            // Add the transaction to the history
            if(!(result.value.timestamp.seconds.low.toString() in transactionHistory)){
              transactionHistory[result.value.timestamp.seconds.low.toString()] = {
                timestamp : result.value.timestamp.seconds.low, 
                tx_id: result.value.tx_id.toString(),
                pending: batchAmount
              };
            } 

            // Add the change to the transaction
            if(historyKeys[k] == batchStatusKey){
              let historyStatusValue = result.value.value.toBuffer().toString();
              historyStatusValue = (historyStatusValue == '') ? 'ordered' : historyStatusValue;
              transactionHistory[result.value.timestamp.seconds.low.toString()].status = historyStatusValue;
            }
            if(historyKeys[k] == batchDeliveredKey){
              let historyDeliveredValue = parseInt(result.value.value.toBuffer().toString());
              transactionHistory[result.value.timestamp.seconds.low.toString()].delivered = historyDeliveredValue;
              transactionHistory[result.value.timestamp.seconds.low.toString()].pending = batchAmount - historyDeliveredValue;
            }
            if(historyKeys[k] == batchReceivedKey){
              transactionHistory[result.value.timestamp.seconds.low.toString()].received = parseInt(result.value.value.toBuffer().toString());
            }
          }
        }

        // Push the batch information to the batches
        if(useHistory == true){
          Object.keys(transactionHistory).sort().forEach( function(key, i) {
            console.info(util.format('Query Tx loop     : %s', JSON.stringify(transactionHistory[key])));
            history.push(transactionHistory[key]);
          });

          batches.push({batch: batchID, amount: batchAmount, price: batchPrice, status: batchStatus,
          pending: batchPending, delivered: batchDelivered, received: batchReceived, history: history})

        } else {
          batches.push({batch: batchID, amount: batchAmount, price: batchPrice, status: batchStatus,
            pending: batchPending, delivered: batchDelivered, received: batchReceived})
        }
      }
      
      // Push the item information to the details
      jsonResp.details.push({name: name, amount: amount, total: total, batches: batches});

    }
    
    console.info(util.format('Query response    : %s \n', JSON.stringify(jsonResp)));

    return Buffer.from(JSON.stringify(jsonResp));
  }

};

shim.start(new Chaincode());
