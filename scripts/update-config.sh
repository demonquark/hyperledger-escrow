#!/bin/bash

# make this the working directory
cd "${0%/*}"

# Instantiate some variables
DOCKER_FILE="../artifacts/docker-compose.yaml"
CONFIG_FILE="../artifacts/network-config.yaml"
TEMP_FILE="yaml.tmp"

# define the find and replace variables for docker compose yaml file
FIND1="FABRIC_CA_SERVER_CA_KEYFILE=\/etc\/hyperledger\/fabric-ca-server-config\/"
FIND2="FABRIC_CA_SERVER_TLS_KEYFILE=\/etc\/hyperledger\/fabric-ca-server-config\/"
REPLACE1="$(basename ../artifacts/channel/crypto-config/peerOrganizations/org1.example.com/ca/*_sk)"
REPLACE2="$(basename ../artifacts/channel/crypto-config/peerOrganizations/org2.example.com/ca/*_sk)"
REPLACE3="$(basename ../artifacts/channel/crypto-config/peerOrganizations/org3.example.com/ca/*_sk)"

# replace the content of the docker yaml file (NOTE: Org1 and Org2 are hardcoded!!!)
sed -n '1,/ca\.org1\.example\.com/ p' $DOCKER_FILE | sed '$d' > $TEMP_FILE
sed -n '/ca\.org1\.example\.com/,/ca\.org2\.example\.com/ p' $DOCKER_FILE | sed '$d' | sed "s/\($FIND1\).*/\1$REPLACE1/" | sed "s/\($FIND2\).*/\1$REPLACE1/" >> $TEMP_FILE
sed -n '/ca\.org2\.example\.com/,/ca\.org3\.example\.com/ p' $DOCKER_FILE | sed '$d' | sed "s/\($FIND1\).*/\1$REPLACE2/" | sed "s/\($FIND2\).*/\1$REPLACE2/" >> $TEMP_FILE
sed -n '/ca\.org3\.example\.com/,$ p' $DOCKER_FILE | sed "s/\($FIND1\).*/\1$REPLACE3/" | sed "s/\($FIND2\).*/\1$REPLACE3/" >> $TEMP_FILE
mv $TEMP_FILE $DOCKER_FILE
chmod 0755 $DOCKER_FILE
echo "Replaced the CA certificate keys in $DOCKER_FILE"

# define the find and replace variables for network config yaml file
FIND1="Admin@org1\.example\.com\/msp\/keystore\/"
FIND2="Admin@org2\.example\.com\/msp\/keystore\/"
FIND3="Admin@org3\.example\.com\/msp\/keystore\/"
REPLACE1="$(basename ../artifacts/channel/crypto-config/peerOrganizations/org1.example.com/users/Admin\@org1.example.com/msp/keystore/*_sk)"
REPLACE2="$(basename ../artifacts/channel/crypto-config/peerOrganizations/org2.example.com/users/Admin\@org2.example.com/msp/keystore/*_sk)"
REPLACE3="$(basename ../artifacts/channel/crypto-config/peerOrganizations/org3.example.com/users/Admin\@org3.example.com/msp/keystore/*_sk)"

# replace the content of the network config yaml file (NOTE: Org1 and Org2 are hardcoded!!!)
sed "s/\($FIND1\).*/\1$REPLACE1/" $CONFIG_FILE | sed "s/\($FIND2\).*/\1$REPLACE2/" | sed "s/\($FIND3\).*/\1$REPLACE3/" > $TEMP_FILE
mv $TEMP_FILE $CONFIG_FILE
chmod 0755 $CONFIG_FILE
echo "Replaced the Admin keys in $CONFIG_FILE"
