const http=require("http"),https=require("https"),url=require("url");
const T={host:"asdirectprod.generali.hr",port:8080};
http.createServer(function(q,s){
  var parsed=url.parse(q.url,true);
  var path=parsed.pathname;

  // GetDokumenti: CF Worker ne može slati GET s bodyjem, pa šaljemo ?faza= kao query param
  // Proxy čita query param i konstruira pravi GET s bodyjem za Generali
  if(path.indexOf("GetDokumenti")>-1){
    var faza=parsed.query.faza||"predugovorna";
    var body=JSON.stringify({faza:faza});
    var len=Buffer.byteLength(body);
    var o={hostname:T.host,port:T.port,path:path,method:"GET",
           headers:{"Content-Type":"application/json","Content-Length":len,
                    "Authorization":q.headers["authorization"]||"",
                    "host":T.host+":"+T.port},
           rejectUnauthorized:false};
    var p=https.request(o,function(r){s.writeHead(r.statusCode,r.headers);r.pipe(s);});
    p.on("error",function(e){s.writeHead(502);s.end(e.message);});
    p.write(body);
    p.end();
    return;
  }

  // Svi ostali endpointi — pass-through
  var o={hostname:T.host,port:T.port,path:q.url,method:q.method,
         headers:Object.assign({},q.headers,{host:T.host+":"+T.port}),
         rejectUnauthorized:false};
  var p=https.request(o,function(r){s.writeHead(r.statusCode,r.headers);r.pipe(s);});
  p.on("error",function(e){s.writeHead(502);s.end(e.message);});
  q.pipe(p);
}).listen(3000,function(){console.log("Proxy:3000");});
