## Escrow demo

A simple Node.js app to demonstrate blockchain with **__fabric-client__** & **__fabric-ca-client__** Node.js SDK APIs

### Prerequisites and setup:

* [Docker](https://www.docker.com/products/overview) - v1.12 or higher
* [Docker Compose](https://docs.docker.com/compose/overview/) - v1.8 or higher
* [Git client](https://git-scm.com/downloads) - needed for clone commands
* [Download Docker images](http://hyperledger-fabric.readthedocs.io/en/latest/samples.html#binaries)
* **Node.js** v8.4.0 or higher
* Copy the downloaded binaries to the ``bin`` directory of this project (overwriting any existing binaries)
  We need the following binaries: ``configtxgen``,``configtxlator``,``cryptogen``,``orderer``,``peer``

Reference the [hyperledger fabric docs](https://hyperledger-fabric.readthedocs.io/en/release-1.1/getting_started.html#hyperledger-fabric-samples) for more information on setup and 

### Generate Network Artifacts

We will use the ``cryptogen`` tool to generate the cryptographic material (x509 certs and signing keys) for our various network entities. These certificates are representative of identities, and they allow for sign/verify authentication to take place as our entities communicate and transact.

Cryptogen consumes a file - ``artifacts/channel/cryptogen.yaml`` - that contains the network topology and allows us to generate a set of certificates and keys for both the Organizations and the components that belong to those Organizations. After we run the cryptogen tool, the generated certificates and keys will be saved to a folder titled crypto-config.

Next, run the ``configtxgen`` command to create the orderer genesis block for our channel. he configtxgen command allows users to create and inspect channel config related artifacts. The content of the generated artifacts is dictated by the contents of ``artifacts/channel/configtx.yaml`` that contains the definitions for the sample network.

* All commands assume that you are in the app's root directory (i.e. the folder containing app.js). 
* The binary tools are in the ``bin`` directory, so we provide the relative path to where the tool resides.
* The commands use the harcoded values for channel name (``mychannel``) and profiles ( ``TwoOrgsOrdererGenesis``, ``TwoOrgsChannel``) defined in the ``cryptogen.yaml`` and ``configtx.yaml`` files. 

First, run ``cryptogen`` to generate the certificates and keys:

```
./bin/cryptogen generate --config=artifacts/channel/cryptogen.yaml --output="artifacts/channel/crypto-config"
```

Next, we need to tell the ``configtxgen`` tool where to look for the ``configtx.yaml`` file that it needs to ingest. We will tell it look in the channel directory:

```
export FABRIC_CFG_PATH=$PWD/artifacts/channel
```

Then, we'll invoke the ``configtxgen`` tool to create the orderer genesis block:

```
./bin/configtxgen -profile ThreeOrgsOrdererGenesis -outputBlock ./artifacts/channel/genesis.block
```

Finally, we use the ``configtxgen`` tool to create the channel transaction artifact:

```
./bin/configtxgen -profile ThreeOrgsChannel -outputCreateChannelTx ./artifacts/channel/mychannel.tx -channelID mychannel
```

### Update the network configuration

The newly created signing keys and certificates mean that you have to update the admin credentials in ``artifacts/network-config.yaml`` for Org1, Org2 and Org3. We need to point to the private keys for our Organization’s CA’s in ``artifacts/docker-compose.yaml``. You can locate the new values in your crypto-config folder. 

You can update the network configuration with the provided shell script
```
./bin/update-config.sh 
```

**Alternatively you can do this manually:**

To locate the private keys for Org1's CA for Org1 we would follow this path - ``artifacts/channel/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/``. The private key is a long hash value followed by _sk. The path for Org2 would be - ``artifacts/channel/crypto-config/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp/keystore/``. Do the same for Org3.

To locate the admin private key for Org1 we would follow this path - ``artifacts/channel/crypto-config/peerOrganizations/org1.example.com/ca/``. Again, the private key is a long hash value followed by _sk. The path for Org2 would be - ``artifacts/channel/crypto-config/peerOrganizations/org1.example.com/ca/``. Do the same for Org3.

First, change the admin private keys. Open the ``artifacts/network-config.yaml`` file and navigate to the ``path`` of the ``adminPrivateKey``. Replace ``<insert key here>`` with the correct keys. For example: 
```
organizations:
 Org1:
  ...
  adminPrivateKey:
   path: artifacts/channel/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/<insert key here>
 Org2:
  ...
  adminPrivateKey:
   path: artifacts/channel/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/<insert key here>
 Org3:
  ...
  adminPrivateKey:
   path: artifacts/channel/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/<insert key here>
```
```
organizations:
 Org1:
  ...
  adminPrivateKey:
   path: artifacts/channel/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/1d80696336cb7721f6c7890fe5b1e643e7479f3deca2a7f902e704fb96adf5cf_sk
 Org2:
  ...
  adminPrivateKey:
   path: artifacts/channel/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/b743667f15dc1c747e9d414f3058f283e5e55595d7e1bab7bf51eaf910191771_sk
 Org3:
  ...
  adminPrivateKey:
   path: artifacts/channel/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/0d9f72608133ee627b570b6af6877666bc8f365746f9329d6dd8a5f54e53e2ab_sk
```

Next, change the service certificate keys. Open the ``artifacts/docker-compose.yaml`` file and navigate to ``FABRIC_CA_SERVER_CA_KEYFILE`` and ``FABRIC_CA_SERVER_TLS_KEYFILE``. Replace ``<insert key here>`` with the the correct keys. For example:
```
services:
 ca.org1.example.com:
  environment:
    ...
    - FABRIC_CA_SERVER_CA_KEYFILE=/etc/hyperledger/fabric-ca-server-config/<insert key here>
    ...
    - FABRIC_CA_SERVER_TLS_KEYFILE=/etc/hyperledger/fabric-ca-server-config/<insert key here>
 ca.org2.example.com:
  environment:
   ...
   - FABRIC_CA_SERVER_CA_KEYFILE=/etc/hyperledger/fabric-ca-server-config/<insert key here>
   ...
   - FABRIC_CA_SERVER_TLS_KEYFILE=/etc/hyperledger/fabric-ca-server-config/<insert key here>
 ca.org3.example.com:
  environment:
   ...
   - FABRIC_CA_SERVER_CA_KEYFILE=/etc/hyperledger/fabric-ca-server-config/<insert key here>
   ...
   - FABRIC_CA_SERVER_TLS_KEYFILE=/etc/hyperledger/fabric-ca-server-config/<insert key here>
```
```
services:
 ca.org1.example.com:
  environment:
    ...
    - FABRIC_CA_SERVER_CA_KEYFILE=/etc/hyperledger/fabric-ca-server-config/ea74dff6f721a040456a2baccd146fa6c27727d665566403c39fd93fac734bc8_sk
    ...
    - FABRIC_CA_SERVER_TLS_KEYFILE=/etc/hyperledger/fabric-ca-server-config/ea74dff6f721a040456a2baccd146fa6c27727d665566403c39fd93fac734bc8_sk
 ca.org2.example.com:
  environment:
   ...
   - FABRIC_CA_SERVER_CA_KEYFILE=/etc/hyperledger/fabric-ca-server-config/70c29f105623fd21ac99a12954164f36864ab5fcdc215d76cc008eb1ef16ddf1_sk
   ...
   - FABRIC_CA_SERVER_TLS_KEYFILE=/etc/hyperledger/fabric-ca-server-config/70c29f105623fd21ac99a12954164f36864ab5fcdc215d76cc008eb1ef16ddf1_sk
 ca.org3.example.com:
  environment:
   ...
   - FABRIC_CA_SERVER_CA_KEYFILE=/etc/hyperledger/fabric-ca-server-config/1995b11d6573ed3be52fcd7a5fa477bc0f183e1f5f398c8281d0ce7c2c75a076_sk
   ...
   - FABRIC_CA_SERVER_TLS_KEYFILE=/etc/hyperledger/fabric-ca-server-config/1995b11d6573ed3be52fcd7a5fa477bc0f183e1f5f398c8281d0ce7c2c75a076_sk
```

## Running the sample program

Now that we've generated the artifacts and updated the configuration, we can run the program. You may choose to run with chaincode written in golang or in node.js.

##### Terminal Window 1

* Launch the network using docker-compose

```
docker-compose -f artifacts/docker-compose.yaml up
```
##### Terminal Window 2

* Install the fabric-client and fabric-ca-client node modules

```
npm install
```

* Start the node app on PORT 4000

```
PORT=4000 node app
```

##### Terminal Window 3

* Run the API request given below to communicate with the node app.

## REST APIs Requests: Setup and Chaincode Instantiation

### Login Request

* Register and enroll new users in Organization - **Org1**:

```
curl -s -X POST http://localhost:4000/users -H "content-type: application/x-www-form-urlencoded" -d 'username=James&orgname=Org1'
```
**OUTPUT:**

```
{
  "success": true,
  "secret": "RaxhMgevgJcm",
  "message": "Jim enrolled Successfully",
  "token": "<put JSON Web Token here>"
}
```

The response contains the success/failure status, an **enrollment Secret** and a **JSON Web Token (JWT)** that is a required string in the Request Headers for subsequent requests.

### Create Channel request

```
curl -s -X POST \
  http://localhost:4000/channels \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json" \
  -d '{
	"channelName":"mychannel",
	"channelConfigPath":"../artifacts/channel/mychannel.tx"
}'
```

Please note that the Header **authorization** must contain the JWT returned from the `POST /users` call

### Join Channel request

```
curl -s -X POST \
  http://localhost:4000/channels/mychannel/peers \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer0.org1.example.com","peer1.org1.example.com"]
}'
```

### Install chaincode

When node.js chaincode is used, the *chaincodeType* must be set to **node** and *chaincodePath* must be set to the location of the node.js chaincode. The chaincode path is from the root, so add the $PWD.
```
curl -s -X POST \
  http://localhost:4000/chaincodes \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer0.org1.example.com","peer1.org1.example.com"],
	"chaincodeName":"escrow",
	"chaincodePath":"<put $PWD here>/artifacts/src/example.com/escrow/node",
	"chaincodeType": "node",
	"chaincodeVersion":"v0"
}'
```
**Alternatively you can use a Go implementation of chaincode:**

When Go chaincode is used, the *chaincodeType* must be set to **golang**  and *chaincodePath* must be set to the location of the go chaincode, relative to the *src* folder.
```
curl -s -X POST \
  http://localhost:4000/chaincodes \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer0.org1.example.com","peer1.org1.example.com"],
	"chaincodeName":"escrow",
	"chaincodePath":"example.com/escrow/go",
	"chaincodeType": "golang",
	"chaincodeVersion":"v0"
}'
```

### Instantiate chaincode

```
curl -s -X POST \
  http://localhost:4000/channels/mychannel/chaincodes \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json" \
  -d '{
	"peers": ["peer0.org1.example.com","peer1.org1.example.com"],
	"chaincodeName":"escrow",
	"chaincodeVersion":"v0",
	"chaincodeType": "node",
	"args":["nothing"]
}'
```
**NOTE:** *chaincodeType* must be set to **golang** when Go chaincode is used

## REST APIs Requests: Chaincode Interaction

**NOTE:** The definition of JSON objects for invoke request are in the ``json`` folder. Not all the chaincode interactions are listed below. See the ``json`` folder or ``app.js`` file for all possible endpoints and interactions.
 
### Invoke: Create Item / Money

```
curl -s -X POST \
  http://localhost:4000/channels/mychannel/chaincodes/escrow/create \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json" \
  -d '{
    "peers": ["peer0.org1.example.com"],
    "type": "item",
    "details": {"name": "x", "amount": "50", "price": "5"}
}'
```

### Invoke: Create Purchase Order

```
curl -s -X POST \
  http://localhost:4000/channels/mychannel/chaincodes/escrow/create \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json" \
  -d '{
    "peers": ["peer0.org1.example.com"],
    "type": "po",
    "details": [{"name": "x", "amount": "70"}, {"name": "y", "amount": "100"}]
}'
```

### Invoke: Deliver Item

```
curl -s -X POST \
  http://localhost:4000/channels/mychannel/chaincodes/escrow/deliver \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json" \
  -d '{
    "peers": ["peer0.org1.example.com"],
    "po": "1",
    "details": [{"name": "x", "batches": [{"batch": "1", "amount": "50"}, {"batch": "2", "amount": "20"}]}, {"name": "y", "batches": [{"batch": "1", "amount": "50"}, {"batch": "2", "amount": "25"}]}]
}'
```

### Invoke: Receive Item

```
curl -s -X POST \
  http://localhost:4000/channels/mychannel/chaincodes/escrow/receive \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json" \
  -d '{
    "peers": ["peer0.org1.example.com"],
    "po": "1",
    "details": [{"name": "x", "batches": [{"batch": "1", "amount": "50"}, {"batch": "2", "amount": "20"}]}, {"name": "y", "batches": [{"batch": "1", "amount": "50"}, {"batch": "2", "amount": "25"}]}]
}'
```

### Query: Names

```
curl -s -X GET \
  "http://localhost:4000/channels/mychannel/chaincodes/escrow/names?owner=true" \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json"
```

### Query: Items / Money

```
curl -s -X GET \
  "http://localhost:4000/channels/mychannel/chaincodes/escrow/item?type=money&name=RMB&history=true" \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json"
```

### Query: Items

```
curl -s -X GET \
  "http://localhost:4000/channels/mychannel/chaincodes/escrow/po?history=true&po=1" \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json"
```

## REST APIs Requests: Chain queries

### Query Block by BlockNumber

```
curl -s -X GET \
  "http://localhost:4000/channels/mychannel/blocks/1?peer=peer0.org1.example.com" \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json"
```

### Query Transaction by TransactionID

```
curl -s -X GET http://localhost:4000/channels/mychannel/transactions/<put transaction id here>?peer=peer0.org1.example.com \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json"
```
**NOTE**: The transaction id can be from any previous invoke transaction, see results of the invoke request, will look something like `8a95b1794cb17e7772164c3f1292f8410fcfdc1943955a35c9764a21fcd1d1b3`.


### Query ChainInfo

```
curl -s -X GET \
  "http://localhost:4000/channels/mychannel?peer=peer0.org1.example.com" \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json"
```

### Query Installed chaincodes

```
curl -s -X GET \
  "http://localhost:4000/chaincodes?peer=peer0.org1.example.com&type=installed" \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json"
```

### Query Instantiated chaincodes

```
curl -s -X GET \
  "http://localhost:4000/chaincodes?peer=peer0.org1.example.com&type=instantiated" \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json"
```

### Query Channels

```
curl -s -X GET \
  "http://localhost:4000/channels?peer=peer0.org1.example.com" \
  -H "authorization: Bearer <put JSON Web Token here>" \
  -H "content-type: application/json"
```

## Clean the network

You can stop both the network (Terminal 1) and the node app (Terminal 2) with ``Ctrl+c``.
The network will still be running at this point. Before starting again, here are the commands which cleans the containers and artifacts.

```
docker-compose -f artifacts/docker-compose.yaml down
docker rm -f $(docker ps -aq)
docker rmi -f $(docker images | grep dev | awk '{print $3}')
rm -rf artifacts/channel/crypto-config
rm -rf artifacts/channel/genesis.block
rm -rf artifacts/channel/*.tx
rm -rf fabric-client-kv-org[1-3]
rm -rf /tmp/fabric-client-kv-org[1-3]
./bin/restore-config.sh 
docker network prune
docker container prune
```

## Discover IP Address

To retrieve the IP Address for one of your network entities, issue the following command:

```
# this will return the IP Address for peer0
docker inspect peer0 | grep IPAddress
```