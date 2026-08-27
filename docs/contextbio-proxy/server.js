// contextbio.ai/labi → S1(LABi) 경로 유지형 프록시 (Cloud Run용, 의존성 없음)
// Firebase Hosting rewrite가 /labi/** 요청을 이 서비스로 보내면, 원 경로 그대로
// 오리진(https://c1.sysmed.kr)에 중계한다.
const http = require("node:http");
const https = require("node:https");

const ORIGIN_HOST = process.env.ORIGIN_HOST || "c1.sysmed.kr";
const PUBLIC_HOST = process.env.PUBLIC_HOST || "contextbio.ai";
const PORT = process.env.PORT || 8080;

http
  .createServer((req, res) => {
    const headers = { ...req.headers };
    delete headers["host"];
    delete headers["connection"];
    headers["host"] = ORIGIN_HOST;
    headers["x-forwarded-host"] = PUBLIC_HOST;
    headers["x-forwarded-proto"] = "https";

    const upstream = https.request(
      { hostname: ORIGIN_HOST, port: 443, path: req.url, method: req.method, headers },
      (up) => {
        const outHeaders = { ...up.headers };
        // 오리진 도메인으로 나가는 절대 URL 리다이렉트를 공개 도메인으로 교정
        if (outHeaders.location) {
          outHeaders.location = String(outHeaders.location).replace(
            `https://${ORIGIN_HOST}`,
            `https://${PUBLIC_HOST}`
          );
        }
        res.writeHead(up.statusCode || 502, outHeaders);
        up.pipe(res);
      }
    );
    upstream.on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(`upstream error: ${e.message}`);
    });
    req.pipe(upstream);
  })
  .listen(PORT, () => console.log(`labi proxy on :${PORT} → https://${ORIGIN_HOST}`));
