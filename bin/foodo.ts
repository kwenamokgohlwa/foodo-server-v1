#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import { FoodoStack } from '../lib/foodo-stack'

const app = new cdk.App()
new FoodoStack(app, 'FoodoStack', {
  env: {
    region: app.node.tryGetContext('region'),
    account: app.node.tryGetContext('accountID'),
  },
})
