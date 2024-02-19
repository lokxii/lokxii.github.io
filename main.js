async function request() {
    const response = await fetch("https://bsky.social/xrpc/app.bsky.feed.getFeed?feed=at://did:plc:wvh2nzdw4o4fnw5qhaxzereb/app.bsky.feed.generator/aaac6poj633x4", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
    });
    return response.json();
}

request().then((data) => {
    console.log(data)
})
