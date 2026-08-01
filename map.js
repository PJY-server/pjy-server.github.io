// =============================
// 놀맵 V2
// OpenStreetMap + Leaflet
// map.js
// =============================

let map;
let currentMarker = null;
let destinationMarker = null;
let routeLine = null;

// GraphHopper API Key
// ↓↓↓ 나중에 발급받은 키로 교체
const GRAPHHOPPER_API_KEY = "3c3565c1-8006-47fc-af83-e0b2ea29a5d5";

// --------------------------------
// 지도 생성
// --------------------------------

window.addEventListener("load", () => {

    map = L.map("map", {

        zoomControl: false

    }).setView([37.5665, 126.9780], 15);

    L.tileLayer(

        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

        {

            attribution: "&copy; OpenStreetMap"

        }

    ).addTo(map);

});

// --------------------------------
// 현재 위치 표시
// --------------------------------

function showCurrentLocation(position){

    if(currentMarker){

        map.removeLayer(currentMarker);

    }

    currentMarker = L.marker([

        position.lat,

        position.lng

    ]).addTo(map);

    currentMarker.bindPopup("📍 현재 위치");

    map.setView(

        [

            position.lat,

            position.lng

        ],

        17

    );

}

// --------------------------------
// 현재 위치 이동
// --------------------------------

function moveMap(position){

    map.flyTo(

        [

            position.lat,

            position.lng

        ],

        17

    );

}

// --------------------------------
// 목적지 검색
// (Nominatim)
// --------------------------------

async function searchLocation(keyword){

    const url =

        "https://nominatim.openstreetmap.org/search?format=json&q="

        + encodeURIComponent(keyword);

    const res = await fetch(url);

    const data = await res.json();

    if(data.length===0){

        alert("검색 결과가 없습니다.");

        return;

    }

    const place = data[0];

    const lat = Number(place.lat);

    const lon = Number(place.lon);

    if(destinationMarker){

        map.removeLayer(destinationMarker);

    }

    destinationMarker =

        L.marker([lat,lon])

        .addTo(map)

        .bindPopup(place.display_name)

        .openPopup();

    map.flyTo([lat,lon],16);

    if(currentLocation){

        requestRoute(

            currentLocation.lat,

            currentLocation.lng,

            lat,

            lon

        );

    }

}

// --------------------------------
// GraphHopper 길찾기
// --------------------------------

async function requestRoute(

    startLat,

    startLng,

    endLat,

    endLng

){

    const url =

    `https://graphhopper.com/api/1/route?

    point=${startLat},${startLng}

    &point=${endLat},${endLng}

    &profile=foot

    &points_encoded=false

    &key=${GRAPHHOPPER_API_KEY}`

    .replace(/\s+/g,"");

    const response = await fetch(url);

    const json = await response.json();

    if(!json.paths){

        alert("경로를 찾을 수 없습니다.");

        return;

    }

    const coordinates =

        json.paths[0]

        .points

        .coordinates

        .map(c=>[c[1],c[0]]);

    if(routeLine){

        map.removeLayer(routeLine);

    }

    routeLine =

        L.polyline(

            coordinates,

            {

                color:"#27A8D8",

                weight:6

            }

        ).addTo(map);

    map.fitBounds(routeLine.getBounds());

}
