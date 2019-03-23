const pupeteer = require("puppeteer");
const cheerio = require("cheerio");
const nodemailer = require("nodemailer");
const config = require("./keys/config");
const fs = require("fs");
const util = require("util");
const { PendingXHR } = require('pending-xhr-puppeteer');

let readFile = util.promisify(fs.readFile);

var transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  auth: {
    type: "OAuth2",
    user: config.auth.user,
    clientId: config.auth.clientId,
    clientSecret: config.auth.clientSecret,
    refreshToken: config.auth.refreshToken
  }
});

const asyncForEach = async(array, callback) => {
    for (let index = 0; index < array.length; index++) {
        await callback(array[index]);
    }
};

const delay = ms => new Promise(res => setTimeout(res, ms));

const fetchContracts = async ({url, agency, awardId }) => {

    const browser = await pupeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox']});
    const page = await browser.newPage(); // Create new instance of puppet
    const pendingXHR = new PendingXHR(page);

    // CHECK BOXES
    await page.goto(url, { waitUntil: 'networkidle2' }); // Ensure no network requests are happening (in last 500ms).
    await page.click("#dnf_class_values_procurement_notice__procurement_type___a_check"); // Awards only...
    await page.click("input[value='specific']"); // Click to enter the specific agency...
        
    // TYPE AND SELECT AGENCIES
    await page.type('#autocomplete_input_dnf_class_values_procurement_notice__agency__dnf_multiplerelation_picks___', agency);
    await delay(1000); // Wait for register...
        await pendingXHR.waitForAllXhrFinished();  // Wait for XHR...
        
        // Click on proper dropdown...
        // Assign agency to proper formatted name...
        let agencySelect = '';
        switch (agency){
            case 'Air Force':
                agencySelect = 'Department of the Air Force';
                break;
            case 'Army':
                agencySelect = 'Department of the Army';
                break;
            case 'Navy':
                agencySelect = 'Department of the Navy';
                break;
        }; 
        let listSelector = '.yui-ac-bd li';
        let selected = await page.evaluate(({ listSelector, agencySelect}) => {
            let items = Array.from(document.querySelectorAll(listSelector));
            let filtered = items.filter(item => item.innerText.trim() == agencySelect);
            return filtered;
        }, { listSelector, agencySelect });

        refinedSelected = `#ac_pick_id_0_${selected[0]._oResultData[1]}`;
        await page.click(refinedSelected);
        await pendingXHR.waitForAllXhrFinished();  // Wait for XHR...

    // SET DATE AS TODAY...
    await page.click('#dnf_class_values_procurement_notice__contract_award_date___start_');
    await page.click('td.day.selected.today');
    await page.click('#dnf_class_values_procurement_notice__contract_award_date___end_');
    await page.click('div.calendar + div.calendar td.day.selected.today');
    
    // SEARCH!!!
    await Promise.all([
        page.click('input.btn.btn_search'),
        page.waitForNavigation({ waitUntil: 'networkidle2' }) // Ensure no network requests are happening (in last 500ms).
    ]);
    

    let html = await page.content();
    return { html, page, browser, awardId };
}

const bot = async ({ url, agency, awardId }) => {
    return fetchContracts({ url, agency, awardId })
    .then(async({ html, page, browser, awardId }) => {

        let $ = cheerio.load(html);
        let links = [];
        let pageLinks = $(".lst-cl-first a");
        pageLinks.each((i,link) => {
            let linkPath = ($(link).attr('href'))
            links.push(`https://www.fbo.gov${linkPath}`);
        });

        return { links, page, browser, awardId };
        
    })
    .then(async({ links, page, browser, awardId }) => {
        let correctUrl = null;
        await asyncForEach(links, async(link) => {
    
            await page.goto(link, { waitUntil: 'networkidle2' });
            let html = await page.content();
            let $ = cheerio.load(html);        
            
            let awardNumber = $('#dnf_class_values_procurement_notice__contract_award_number__widget').text().trim();
            if(awardNumber === awardId){
                /// BREAK OUT AND RETURN URL HERE....
                correctUrl = page.url();

            };
        });
        await browser.close();
        return correctUrl;
    })
};

bot({ url: "https://www.fbo.gov/index?s=opportunity&tab=search&mode=list", agency: "Army", awardId: 'SPE8EF19P0336' })
    .then(res => {
        if(correctUrl){

        } else {

        }
    });
