import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const pkg=JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
const capacitor=JSON.parse(readFileSync(new URL('capacitor.config.json',root),'utf8'));
const plist=readFileSync(new URL('ios/App/App/Info.plist',root),'utf8');
const workflow=readFileSync(new URL('.github/workflows/ios-build.yml',root),'utf8');
const signedWorkflow=readFileSync(new URL('.github/workflows/ios-ipa.yml',root),'utf8');
const appIcon=readFileSync(new URL('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',root));

test('Capacitor iOS uses the shared Evenit app and synchronized mobile bundle',()=>{
  assert.match(pkg.dependencies['@capacitor/ios'],/^\^8\./);
  assert.match(pkg.scripts['mobile:sync:ios'],/cap sync ios/);
  assert.match(pkg.scripts['mobile:sync'],/cap sync android && npx cap sync ios/);
  assert.equal(capacitor.appId,'app.evenit.mobile');
  assert.match(capacitor.server.url,/evenit\.vercel\.app/);
  assert.equal(capacitor.ios.preferredContentMode,'mobile');
  assert.equal(capacitor.ios.contentInset,'never');
  assert.ok(existsSync(new URL('ios/App/App.xcodeproj/project.pbxproj',root)));
});

test('iOS declares every device permission used by the existing features',()=>{
  assert.match(plist,/NSCameraUsageDescription/);
  assert.match(plist,/NSPhotoLibraryUsageDescription/);
  assert.match(plist,/NSLocationWhenInUseUsageDescription/);
  assert.match(plist,/app\.evenit\.mobile/);
});

test('iOS artwork and the unsigned macOS build check are present',()=>{
  assert.equal(appIcon.toString('ascii',1,4),'PNG');
  assert.equal(appIcon.readUInt32BE(16),1024);
  assert.equal(appIcon.readUInt32BE(20),1024);
  assert.match(workflow,/runs-on: macos-latest/);
  assert.match(workflow,/sdk iphonesimulator/);
  assert.match(workflow,/CODE_SIGNING_ALLOWED=NO/);
  assert.match(workflow,/Evenit-iOS-Simulator/);
  assert.match(signedWorkflow,/Build signed iOS IPA/);
  assert.match(signedWorkflow,/IOS_CERTIFICATE_P12_BASE64/);
  assert.match(signedWorkflow,/xcodebuild -exportArchive/);
  assert.match(signedWorkflow,/Evenit\.ipa/);
});
