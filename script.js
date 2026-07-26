let map;
let userMarker;
let placeMarkers = [];


// 지도 시작
function initMap() {

    map = L.map("map").setView(
        [37.5665, 126.9780],
        13
    );


    L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "© OpenStreetMap"
        }
    ).addTo(map);

}



// 내 위치
function myLocation() {


    if (!navigator.geolocation) {

        alert("위치 기능을 지원하지 않습니다.");
        return;

    }


    navigator.geolocation.getCurrentPosition(

        function(position){

            let lat = position.coords.latitude;
            let lng = position.coords.longitude;


            map.setView(
                [lat,lng],
                16
            );


            if(userMarker){
                map.removeLayer(userMarker);
            }


            userMarker = L.marker(
                [lat,lng]
            )
            .addTo(map)
            .bindPopup(
                "📍 현재 위치"
            )
            .openPopup();


        },

        function(){

            alert(
                "위치 권한을 허용해주세요."
            );

        }

    );


}



// 장소 검색
async function searchPlace(keyword){


    // 기존 마커 삭제
    placeMarkers.forEach(
        marker => map.removeLayer(marker)
    );

    placeMarkers = [];



    let center = map.getCenter();



    let url =
    "https://nominatim.openstreetmap.org/search?" +
    "q=" + encodeURIComponent(keyword) +
    "&format=json" +
    "&limit=10" +
    "&lat=" + center.lat +
    "&lon=" + center.lng;



    try{


        let response =
            await fetch(url);


        let data =
            await response.json();



        if(data.length === 0){

            alert(
                "검색 결과가 없습니다."
            );

            return;

        }



        data.forEach(place=>{


            let marker =
                L.marker(
                    [
                        place.lat,
                        place.lon
                    ]
                )
                .addTo(map)
                .bindPopup(
                    "📍 " + place.display_name
                );


            placeMarkers.push(marker);


        });



        map.fitBounds(
            placeMarkers.map(
                m=>m.getLatLng()
            )
        );



    }
    catch(error){

        console.log(error);

        alert(
            "검색 중 오류 발생"
        );

    }


}



initMap();
