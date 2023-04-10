// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSEvent } from 'aws-lambda';

const client = new DynamoDBClient({});

export async function handler(event: SQSEvent) {
  console.log(event);

  const updatedRecords: string[] = [];
  const failedRecords: string[] = [];

  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const message = JSON.parse(body.Message);

    const putItem = new PutItemCommand({
      Item: {
        id: { S: message.id },
        message: { S: message.message },
        useCase: { S: message.useCase },
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

  const statusCode = (failedRecords.length == 0) ? 200 : 500;
  return {
    statusCode: statusCode,
    updatedRecords: JSON.stringify(updatedRecords),
    failedRecords: JSON.stringify(failedRecords),
  };
}
