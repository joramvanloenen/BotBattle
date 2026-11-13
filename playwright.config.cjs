module.exports={
 use:{browserName:'chromium',headless:true},
 webServer:{
 command:'python3 -m http.server 4173 --bind 127.0.0.1',
 url:'http://127.0.0.1:4173/',
 reuseExistingServer:true,
 timeout:15000
 },
 reporter:'list'
};