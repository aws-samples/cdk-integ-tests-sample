// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import 'source-map-support/register';
import { IntegTest, ExpectedResult } from '@aws-cdk/integ-tests-alpha';
import * as cdk from 'aws-cdk-lib';
import { CdkIntegTestsDemoStack } from '../lib/cdk-integ-tests-demo-stack';

// CDK App for Integration Tests
const app = new cdk.App();

// Stack under test
const stackUnderTest = new CdkIntegTestsDemoStack(app, 'IntegrationTestStack', {
  setDestroyPolicyToAllResources: true,
});

// Initialize Integ Test construct
const integCDKStackTookit = {
  toolkitStackName: 'CDKToolkit',
};

const integ = new IntegTest(app, 'DemoTest', {
  testCases: [stackUnderTest],
  cdkCommandOptions: {
    deploy: {
      args: {
        ...integCDKStackTookit,
      },
    },
    destroy: {
      args: {
        ...integCDKStackTookit,
        force: true,
      },
    },
  },
});

// Test Case 1: Handle single message
const id = Math.floor(Math.random() * 10000000).toString();
const apiCallsTest1 = integ.assertions
  .awsApiCall('SNS', 'publish', {
    TopicArn: stackUnderTest.topicArn,
    Message: JSON.stringify({
      id: id,
      message: 'This message should be validated',
      useCase: 'CDKIntegTestDemo',
    }),
  })
  .next(
    integ.assertions
      .awsApiCall('DynamoDB', 'getItem', {
        TableName: stackUnderTest.tableName,
        Key: { id: { S: id } },
      })
      .expect(
        ExpectedResult.objectLike({
          Item: {
            id: {
              S: id,
            },
            message: {
              S: 'This message should be validated',
            },
            useCase: {
              S: 'CDKIntegTestDemo',
            },
            additionalAttr: {
              S: 'enriched',
            },
          },
        }),
      )
      .waitForAssertions({
        totalTimeout: cdk.Duration.seconds(25),
        interval: cdk.Duration.seconds(3),
      }),
  );

// add the required permissions to the api call
apiCallsTest1.provider.addToRolePolicy({
  Effect: 'Allow',
  Action: [
    'kms:Encrypt',
    'kms:ReEncrypt*',
    'kms:GenerateDataKey*',
    'kms:Decrypt',
  ],
  Resource: [stackUnderTest.kmsKeyArn],
});
