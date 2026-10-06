const fs = require('fs');
const path = require('path');

const root = __dirname;
const srcDir = path.join(root, 'app', '(onboarding)', 'onboarding', 'v2', '[companyId]');
const destDir = path.join(root, 'app', '(onboarding)', 'onboarding', '[companyId]');

function copyAndReplace(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyAndReplace(srcPath, destPath);
    } else {
      let content = fs.readFileSync(srcPath, 'utf8');
      content = content.replace(/\/onboarding\/v2\//g, '/onboarding/');
      fs.writeFileSync(destPath, content);
    }
  }
}

// 1. Copy the V2 folder to the new location and replace the links inside them
if (fs.existsSync(srcDir)) {
  copyAndReplace(srcDir, destDir);
  console.log('✅ Copied [companyId] out of v2 and updated its routes.');
} else {
  console.log('⚠️ Source directory not found. Already moved?');
}

// 2. Update external references in other files
const filesToUpdate = [
  'app/(onboarding)/pending/page.tsx',
  'app/(dashboard)/companies/[companyId]/page.tsx',
  'app/(auth)/auth/login/page.tsx',
  'lib/hooks/useCompany.ts'
];

for (const relPath of filesToUpdate) {
  const filePath = path.join(root, relPath);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('/onboarding/v2/')) {
      content = content.replace(/\/onboarding\/v2\//g, '/onboarding/');
      fs.writeFileSync(filePath, content);
      console.log(`✅ Updated ${relPath}`);
    }
  }
}

console.log('🎉 All done! You can now delete the `v2` folder whenever you are ready.');
