const {i18n} = require('../../lib/common');
const errors = require('@tryghost/errors');
const {extract, hasProvider} = require('oembed-parser');
const Promise = require('bluebird');
const externalRequest = require('../../lib/request-external');
const cheerio = require('cheerio');
const _ = require('lodash');

async function fetchBookmarkData(url, html) {
    const metascraper = require('metascraper')([
        require('metascraper-url')(),
        require('metascraper-title')(),
        require('metascraper-description')(),
        require('metascraper-author')(),
        require('metascraper-publisher')(),
        require('metascraper-image')(),
        require('metascraper-logo-favicon')(),
        require('metascraper-logo')()
    ]);

    let scraperResponse;

    try {
        if (!html) {
            const response = await externalRequest(url);
            html = response.body;
        }
        scraperResponse = await metascraper({html, url});
    } catch (err) {
        return Promise.reject(err);
    }

    const metadata = Object.assign({}, scraperResponse, {
        thumbnail: scraperResponse.image,
        icon: scraperResponse.logo
    });
    // We want to use standard naming for image and logo
    delete metadata.image;
    delete metadata.logo;

    if (metadata.title && metadata.description) {
        return Promise.resolve({
            type: 'bookmark',
            url,
            metadata
        });
    }
    return Promise.resolve();
}

const findUrlWithProvider = (url) => {
    let provider;

    // build up a list of URL variations to test against because the oembed
    // providers list is not always up to date with scheme or www vs non-www
    let baseUrl = url.replace(/^\/\/|^https?:\/\/(?:www\.)?/, '');
    let testUrls = [
        `http://${baseUrl}`,
        `https://${baseUrl}`,
        `http://www.${baseUrl}`,
        `https://www.${baseUrl}`
    ];

    for (let testUrl of testUrls) {
        provider = hasProvider(testUrl);
        if (provider) {
            url = testUrl;
            break;
        }
    }

    return {url, provider};
};

function unknownProvider(url) {
    return Promise.reject(new errors.ValidationError({
        message: i18n.t('errors.api.oembed.unknownProvider'),
        context: url
    }));
}

function knownProvider(url) {
    return extract(url, {maxwidth: 1280}).catch((err) => {
        return Promise.reject(new errors.InternalServerError({
            message: err.message
        }));
    });
}

function isIpOrLocalhost(url) {
    try {
        const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const IPV6_REGEX = /:/; // fqdns will not have colons
        const HTTP_REGEX = /^https?:/i;

        const {protocol, hostname} = new URL(url);

        if (!HTTP_REGEX.test(protocol) || hostname === 'localhost' || IPV4_REGEX.test(hostname) || IPV6_REGEX.test(hostname)) {
            return true;
        }

        return false;
    } catch (e) {
        return true;
    }
}

function fetchOembedData(_url) {
    // parse the url then validate the protocol and host to make sure it's
    // http(s) and not an IP address or localhost to avoid potential access to
    // internal network endpoints
    if (isIpOrLocalhost(_url)) {
        return unknownProvider();
    }

    // check against known oembed list
    let {url, provider} = findUrlWithProvider(_url);
    if (provider) {
        return knownProvider(url);
    }

    // url not in oembed list so fetch it in case it's a redirect or has a
    // <link rel="alternate" type="application/json+oembed"> element
    return externalRequest(url, {
        method: 'GET',
        timeout: 2 * 1000,
        followRedirect: true
    }).then((response) => {
        // url changed after fetch, see if we were redirected to a known oembed
        if (response.url !== url) {
            ({url, provider} = findUrlWithProvider(response.url));
            if (provider) {
                return knownProvider(url);
            }
        }

        // check for <link rel="alternate" type="application/json+oembed"> element
        let oembedUrl;
        try {
            oembedUrl = cheerio('link[type="application/json+oembed"]', response.body).attr('href');
        } catch (e) {
            return unknownProvider(url);
        }

        if (oembedUrl) {
            // make sure the linked url is not an ip address or localhost
            if (isIpOrLocalhost(oembedUrl)) {
                return unknownProvider(oembedUrl);
            }

            // fetch oembed response from embedded rel="alternate" url
            return externalRequest(oembedUrl, {
                method: 'GET',
                json: true,
                timeout: 2 * 1000,
                followRedirect: true
            }).then((response) => {
                // validate the fetched json against the oembed spec to avoid
                // leaking non-oembed responses
                const body = response.body;
                const hasRequiredFields = body.type && body.version;
                const hasValidType = ['photo', 'video', 'link', 'rich'].includes(body.type);

                if (hasRequiredFields && hasValidType) {
                    // extract known oembed fields from the response to limit leaking of unrecognised data
                    const knownFields = [
                        'type',
                        'version',
                        'html',
                        'url',
                        'title',
                        'width',
                        'height',
                        'author_name',
                        'author_url',
                        'provider_name',
                        'provider_url',
                        'thumbnail_url',
                        'thumbnail_width',
                        'thumbnail_height'
                    ];
                    const oembed = _.pick(body, knownFields);

                    // ensure we have required data for certain types
                    if (oembed.type === 'photo' && !oembed.url) {
                        return;
                    }
                    if ((oembed.type === 'video' || oembed.type === 'rich') && (!oembed.html || !oembed.width || !oembed.height)) {
                        return;
                    }

                    // return the extracted object, don't pass through the response body
                    return oembed;
                }
            }).catch(() => {});
        }
    });
}

module.exports = {
    docName: 'oembed',

    read: {
        permissions: false,
        data: [
            'url',
            'type'
        ],
        options: [],
        query({data}) {
            let {url, type} = data;

            if (type === 'bookmark') {
                return fetchBookmarkData(url)
                    .catch(() => unknownProvider(url));
            }

            return fetchOembedData(url).then((response) => {
                if (!response && !type) {
                    return fetchBookmarkData(url);
                }
                return response;
            }).then((response) => {
                if (!response) {
                    return unknownProvider(url);
                }
                return response;
            }).catch(() => {
                return unknownProvider(url);
            });
        }
    }
};
