#!/usr/bin/env node
/**
 * Database Health Check Script
 *
 * This script checks if all required database tables exist.
 * If any tables are missing, it automatically runs migrations.
 *
 * Run this before starting the dev server to ensure database is ready.
 */

import { execSync } from 'child_process'

const REQUIRED_TABLES = [
  'users',
  'trees',
  'tree_members',
  'nodes',
  'node_relations',
  'invitations',
  'notifications',
  'sessions'
]

console.log('🔍 Checking database health...')

try {
  // Check which tables exist
  const result = execSync(
    'npx wrangler d1 execute zeeta2-production --local --command "SELECT name FROM sqlite_master WHERE type=\'table\' ORDER BY name;"',
    { encoding: 'utf-8', stdio: 'pipe' }
  )

  // Parse the JSON output
  const match = result.match(/\[\s*\{[\s\S]*\}\s*\]/)
  if (!match) {
    console.error('❌ Failed to parse database response')
    process.exit(1)
  }

  const data = JSON.parse(match[0])
  const existingTables = data[0]?.results?.map(row => row.name) || []

  // Check if all required tables exist
  const missingTables = REQUIRED_TABLES.filter(table => !existingTables.includes(table))

  if (missingTables.length === 0) {
    console.log('✅ Database is healthy. All required tables exist.')
    process.exit(0)
  }

  console.warn(`⚠️  Missing tables: ${missingTables.join(', ')}`)
  console.log('🔧 Running migrations...')

  // Run migrations
  execSync('npm run db:migrate:local', { stdio: 'inherit' })

  console.log('✅ Migrations completed successfully.')
  process.exit(0)

} catch (error) {
  console.error('❌ Database health check failed:', error.message)
  console.log('💡 Tip: Run "npm run db:migrate:local" manually to fix database issues.')
  process.exit(1)
}
