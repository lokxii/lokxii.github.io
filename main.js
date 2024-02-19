async function request() {
    const data = {
        feed: "at://did:plc:wvh2nzdw4o4fnw5qhaxzereb/app.bsky.feed.generator/aaac6poj633x4"
    };
    const response = await fetch("https://bsky.social/xrpc/app.bsky.feed.getFeed", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data)
    });
    return response.json();
}

request().then((data) => {
    console.log(data)
})
