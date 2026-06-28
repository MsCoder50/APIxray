export async function sendRequest({ 
  url, 
  method = "GET", 
  pathParams = {}, 
  queryParams = {}, 
  headers = {}, 
  body = null 
}) {
  try {
    let finalUrl = url;

    // Ensure protocol
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.startsWith('/')) {
        finalUrl = `http://localhost:3000${finalUrl}`;
      } else {
        finalUrl = `http://${finalUrl}`;
      }
    }

    // Process path params
    for (const [key, value] of Object.entries(pathParams)) {
      finalUrl = finalUrl.replace(`:${key}`, encodeURIComponent(value))
                         .replace(`{${key}}`, encodeURIComponent(value));
    }

    // Process query params
    if (Object.keys(queryParams).length > 0) {
      const urlObj = new URL(finalUrl);
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          urlObj.searchParams.append(key, value);
        }
      }
      finalUrl = urlObj.toString();
    }

    // Prepare fetch options
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: { ...headers },
    };

    // Process body
    if (body && !['GET', 'HEAD'].includes(fetchOptions.method)) {
      if (typeof body === 'object') {
        fetchOptions.body = JSON.stringify(body);
        if (!fetchOptions.headers['Content-Type'] && !fetchOptions.headers['content-type']) {
          fetchOptions.headers['Content-Type'] = 'application/json';
        }
      } else {
        fetchOptions.body = body; // Raw text/string body
      }
    }

    // Execute
    const startTime = Date.now();
    const response = await fetch(finalUrl, fetchOptions);
    const endTime = Date.now();

    // Parse response
    const timeTaken = endTime - startTime;
    const responseHeaders = Object.fromEntries(response.headers.entries());
    
    let responseData;
    const contentType = response.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      responseData = await response.json();
    } else if (contentType.includes("text/")) {
      responseData = await response.text();
    } else {
      responseData = await response.text();
    }

    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data: responseData,
      timeTaken: `${timeTaken} ms`,
      requestDetails: {
        url: finalUrl,
        method: fetchOptions.method
      }
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: "ERROR",
      data: null
    };
  }
}
