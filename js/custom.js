// to get current year
function getYear() {
    var currentDate = new Date();
    var currentYear = currentDate.getFullYear();
    document.querySelector("#displayYear").innerHTML = currentYear;
}

getYear();


//  owl carousel script
$(".owl-carousel").owlCarousel({
    loop: true,
    margin: 20,
    nav: true,
    navText: [],
    autoplay: true,
    autoplayHoverPause: true,
    responsive: {
        0: {
            items: 1
        },
        1000: {
            items: 2
        }
    }
});

//    end owl carousel script 



/** google_map js **/
function myMap() {
    var mapProp = {
        center: new google.maps.LatLng(40.712775, -74.005973),
        zoom: 18,
    };
    var map = new google.maps.Map(document.getElementById("googleMap"), mapProp);
}

// Tracking
async function getTrackingState(){
    let trackingCodeInput = document.getElementById('tracking-code-input-id');
    let trackingStateDiv = document.getElementById('tracking-state-div-id');
    let trackingStateTxt = document.getElementById('tracking-state-txt-id');
    let trackingH2 = document.getElementById('tracking-h2-id');

    let codice = trackingCodeInput.value;
    if(!codice){
        trackingStateDiv.hidden = true;
    } else {

        try{
            let status = await getTrackingStateRestCall(codice);
            trackingH2.innerHTML = 'Stato spedizione N. ' + codice;
            trackingStateTxt.innerHTML = status;
            trackingStateDiv.hidden = false;
        }catch(error){
            console.log(error);
            trackingStateTxt.innerHTML = 'Codice non valido';
            trackingStateDiv.hidden = false;
        }
    }
}

async function getTrackingStateRestCall(codice){
    let url = 'http://uat-sanchez-logistica.eu-north-1.elasticbeanstalk.com/mono/api/order/trace/state';
    let req = {codice: codice}

    let response = await doPostNoAuthRestCall(url, req);
    let responseJson = await response.json();
    return responseJson.status;
}

async function doPostNoAuthRestCall(url, req){
    let response = await fetch(url, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(req),
    });

    let restCallFailed = response.ok == false;

    if(restCallFailed){
        throw new Error("Rest call failed");
    }

    return response;
}

document.getElementById('tracking-btn-id').onclick = () => getTrackingState();