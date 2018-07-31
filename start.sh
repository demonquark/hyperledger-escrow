#!/bin/bash

./bin/cryptogen generate --config=artifacts/channel/cryptogen.yaml --output="artifacts/channel/crypto-config"
export FABRIC_CFG_PATH=$PWD/artifacts/channel
export CHANNEL_NAME=mychannel
./bin/configtxgen -profile ThreeOrgsOrdererGenesis -outputBlock ./artifacts/channel/genesis.block -channelID system
./bin/configtxgen -profile ThreeOrgsChannel -outputCreateChannelTx ./artifacts/channel/mychannel.tx -channelID $CHANNEL_NAME
# ./bin/configtxgen -profile ThreeOrgsChannel -outputAnchorPeersUpdate ./artifacts/channel/Org1MSPanchors.tx -channelID $CHANNEL_NAME -asOrg Org1MSP
# ./bin/configtxgen -profile ThreeOrgsChannel -outputAnchorPeersUpdate ./artifacts/channel/Org2MSPanchors.tx -channelID $CHANNEL_NAME -asOrg Org2MSP
# ./bin/configtxgen -profile ThreeOrgsChannel -outputAnchorPeersUpdate ./artifacts/channel/Org3MSPanchors.tx -channelID $CHANNEL_NAME -asOrg Org3MSP
./scripts/update-config.sh 
docker-compose -f artifacts/docker-compose.yaml up