const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests/browser',timeout:45000,expect:{timeout:12000},fullyParallel:false,workers:1,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:8123',headless:true,screenshot:'only-on-failure',trace:'retain-on-failure'},
  webServer:{command:'node tools/serve.cjs',url:'http://127.0.0.1:8123',reuseExistingServer:!process.env.CI},
  projects:[{name:'chromium',use:{browserName:'chromium'}}]
});
