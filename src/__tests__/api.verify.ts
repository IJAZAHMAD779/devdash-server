import http from "http";
import app from "../index";

async function runTests() {
  console.log("--- Starting DevDash API Automated Verification ---");

  // Spin up on port 5999 for testing
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(5999, resolve));
  const baseUrl = "http://localhost:5999";

  let failures = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
    } else {
      console.error(`❌ FAIL: ${testName}`, detail || "");
      failures++;
    }
  }

  try {
    // 1. Healthcheck verification
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData: any = await healthRes.json();
    assert(
      healthRes.status === 200 && healthData.status === "healthy" && typeof healthData.timestamp === "string",
      "GET /health returns 200 with status 'healthy' and ISO timestamp",
      healthData
    );

    // 2. 404 Handler verification
    const notFoundRes = await fetch(`${baseUrl}/api/v1/non-existent-endpoint`);
    const notFoundData: any = await notFoundRes.json();
    assert(
      notFoundRes.status === 404 &&
        notFoundData.success === false &&
        notFoundData.error?.code === "NOT_FOUND",
      "GET /api/v1/unknown returns 404 standardized error envelope",
      notFoundData
    );

    // 3. Unauthorized verification (Missing auth header)
    const unauthRes = await fetch(`${baseUrl}/api/v1/projects`);
    const unauthData: any = await unauthRes.json();
    assert(
      unauthRes.status === 401 &&
        unauthData.success === false &&
        unauthData.error?.code === "UNAUTHORIZED",
      "GET /api/v1/projects without token returns 401 UNAUTHORIZED",
      unauthData
    );

    // 4. Unauthorized verification (Invalid auth header format)
    const badAuthRes = await fetch(`${baseUrl}/api/v1/projects`, {
      headers: { Authorization: "Basic invalid" },
    });
    const badAuthData: any = await badAuthRes.json();
    assert(
      badAuthRes.status === 401 &&
        badAuthData.success === false &&
        badAuthData.error?.code === "UNAUTHORIZED",
      "GET /api/v1/projects with invalid auth format returns 401 UNAUTHORIZED",
      badAuthData
    );

    // 5. Validation error verification (POST with invalid body)
    const invalidPostRes = await fetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: {
        Authorization: "Bearer dev_user_test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "", // Empty title - should fail Zod validation
        repositoryUrl: "not-a-valid-url",
      }),
    });
    const invalidPostData: any = await invalidPostRes.json();
    assert(
      invalidPostRes.status === 400 &&
        invalidPostData.success === false &&
        invalidPostData.error?.code === "VALIDATION_ERROR" &&
        Array.isArray(invalidPostData.error?.details) &&
        invalidPostData.error.details.length >= 2,
      "POST /api/v1/projects with invalid payload returns 400 VALIDATION_ERROR with field details",
      invalidPostData
    );

    // 6. Project Query Validation verification (GET with invalid status query)
    const invalidQueryRes = await fetch(`${baseUrl}/api/v1/projects?status=INVALID_STATUS`, {
      headers: {
        Authorization: "Bearer dev_user_test",
      },
    });
    const invalidQueryData: any = await invalidQueryRes.json();
    assert(
      invalidQueryRes.status === 400 &&
        invalidQueryData.success === false &&
        invalidQueryData.error?.code === "VALIDATION_ERROR",
      "GET /api/v1/projects?status=INVALID_STATUS returns 400 VALIDATION_ERROR",
      invalidQueryData
    );

  } catch (err) {
    console.error("Test execution threw error:", err);
    failures++;
  } finally {
    server.close();
  }

  if (failures > 0) {
    console.error(`\nVERDICT: FAIL -- ${failures} test(s) failed`);
    process.exit(1);
  } else {
    console.log("\nVERDICT: PASS -- All API contract invariants verified successfully!");
    process.exit(0);
  }
}

runTests();
