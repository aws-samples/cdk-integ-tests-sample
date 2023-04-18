// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import 'source-map-support/register';
import { Aspects, App } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { CdkIntegTestsDemoStack } from '../lib/cdk-integ-tests-demo-stack';

const app = new App();
new CdkIntegTestsDemoStack(app, 'ApplicationStack', {
  setDestroyPolicyToAllResources: true,
});

// Add the cdk-nag AwsSolutions Pack with extra verbose logging enabled.
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
