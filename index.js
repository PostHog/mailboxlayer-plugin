async function setupPlugin({ config, global }) {
    global.mailboxlayerBaseUrl = `https://apilayer.net/api/check?access_key=${config.mailboxlayerApiKey}`

    const authResponse = await fetchWithRetry(`${global.mailboxlayerBaseUrl}&email=test@example.com&format=1`)

    if (!statusOk(authResponse)) {
        throw new Error(
            'Unable to connect to Mailboxlayer. Please make sure your API key is correct and that you are under your usage limit.'
        )
    }
}

async function processEventBatch(events, { global }) {
    let usefulEvents = [...events].filter((e) => e.event === '$identify')
    for (let event of usefulEvents) {
        const email = getEmailFromIdentifyEvent(event)
        if (email) {
            const emailCheckResponse = await fetchWithRetry(`${global.mailboxlayerBaseUrl}&email=${email}&format=1`)
            const emailCheckJson = await emailCheckResponse.json()
            if (!event['$set']) {
                event['$set'] = {}
            }
            event['$set']['email_score'] = emailCheckJson.score
            event['$set']['suggested_email_fix'] = emailCheckJson.did_you_mean
        }
    }
    return events
}

async function fetchWithRetry(url, options = {}, method = 'GET', isRetry = false) {
    try {
        const res = await fetch(url, { method: method, ...options })
        return res
    } catch {
        if (isRetry) {
            throw new Error(`${method} request to ${url} failed.`)
        }
        const res = await fetchWithRetry(url, options, (method = method), (isRetry = true))
        return res
    }
}

function statusOk(res) {
    return String(res.status)[0] === '2'
}

function isEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    return re.test(String(email).toLowerCase())
}

function getEmailFromIdentifyEvent(event) {
    return isEmail(event.distinct_id)
        ? event.distinct_id
        : !!event['$set'] && Object.keys(event['$set']).includes('email')
        ? event['$set']['email']
        : ''
}
