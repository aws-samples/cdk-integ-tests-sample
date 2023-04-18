// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

/// !cdk-integ IntegrationTestStack
import 'source-map-support/register';
import { IntegTest, ExpectedResult } from '@aws-cdk/integ-tests-alpha';
import { App, Duration, Aspects } from 'aws-cdk-lib';
import { CdkIntegTestsDemoStack } from '../lib/cdk-integ-tests-demo-stack';
import { AwsSolutionsChecks } from 'cdk-nag';
// CDK App for Integration Tests
const app = new App();
// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
// Stack under test
const stackUnderTest = new CdkIntegTestsDemoStack(app, 'IntegrationTestStack', {
  setDestroyPolicyToAllResources: true,
  description:
    "This stack includes the application's resources for integration testing.",
});

// Initialize Integ Test construct
const integ = new IntegTest(app, 'DataFlowTest', {
  testCases: [stackUnderTest], // Define a list of cases for this test
  cdkCommandOptions: {
    // Customize the integ-runner parameters
    destroy: {
      args: {
        force: true,
      },
    },
  },
  regions: [stackUnderTest.region],
});

/**
 * Assertion:
 * The application should handle single message and write the enriched item to the DymnamoDB table.
 */
const id = 'test-id-1';
const message = 'This message should be validated';
/**
 * Publish a message to the SNS topic.
 * Note - SNS topic ARN is a member variable of the
 * application stack for testing purposes.
 */
const assertion = integ.assertions
  .awsApiCall('SNS', 'publish', {
    TopicArn: stackUnderTest.topicArn,
    Message: JSON.stringify({
      id: id,
      message: message,
    }),
  })
  /**
   * Validate that the DynamoDB table contains the enriched message.
   */
  .next(
    integ.assertions
      .awsApiCall('DynamoDB', 'getItem', {
        TableName: stackUnderTest.tableName,
        Key: { id: { S: id } },
      })
      /**
       * Expect the enriched message to be returned.
       */
      .expect(
        ExpectedResult.objectLike({
          Item: {
            id: {
              S: id,
            },
            message: {
              S: message,
            },
            additionalAttr: {
              S: 'enriched',
            },
          },
        }),
      )
      /**
       * Timeout and interval check for assertion to be true.
       * Note - Data may take some time to arrive in DynamoDB.
       * Iteratively executes API call at specified interval.
       */
      .waitForAssertions({
        totalTimeout: Duration.seconds(25),
        interval: Duration.seconds(3),
      }),
  );

// Add the required permissions to the api call
assertion.provider.addToRolePolicy({
  Effect: 'Allow',
  Action: [
    'kms:Encrypt',
    'kms:ReEncrypt*',
    'kms:GenerateDataKey*',
    'kms:Decrypt',
  ],
  Resource: [stackUnderTest.kmsKeyArn],
});
