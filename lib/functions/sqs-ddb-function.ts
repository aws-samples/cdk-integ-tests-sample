// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSEvent } from 'aws-lambda';

/**
 * The DynamoDBClient to interact with DynamoDB
 */
const client = new DynamoDBClient({});

/**
 * Helper function for parsing data of type object or string
 * @param data - The data object to be parsed
 * @returns - The parsed data object based on its type
 */
function parseData(data: object | string) {
  if (typeof data === 'object') return data;
  if (typeof data === 'string') return JSON.parse(data);

  return data;
}

/**
 * Lambda function handler that parses the SQS event and writes the item to a DynamoDB table
 * @param event - The event expected to be sent from SQS
 * @returns - Status code and information about updated and failed records
 */
export async function handler(event: SQSEvent) {
  const updatedRecords: string[] = [];
  const failedRecords: string[] = [];
  for (const record of event.Records) {
    const body = parseData(record.body);
    const message = parseData(body.Message);

    const putItem = new PutItemCommand({
      Item: {
        id: { S: message.id },
        message: { S: message.message },
        additionalAttr: { S: 'enriched' },
      },
      TableName: process.env.TABLE_NAME,
    });

    try {
      await client.send(putItem);
      updatedRecords.push(message.id);
    } catch (e) {
      console.log(e);
      failedRecords.push(message.id);
    }
  }

  const statusCode = failedRecords.length == 0 ? 200 : 500;
  return {
    statusCode: statusCode,
    updatedRecords: JSON.stringify(updatedRecords),
    failedRecords: JSON.stringify(failedRecords),
  };
}
