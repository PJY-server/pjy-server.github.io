let map;
let userMarker;


// 지도 시작
function initMap() {

    // 기본 위치 (서울)
    map = L.map("map").setView([37.5665, 126.9780], 13);


    // OpenStreetMap 불러오기
    L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution: "© OpenStreetMap"
        }
    ).addTo(map);


}



// 내 위치 찾기
function myLocation() {

    if (!navigator.geolocation) {

        alert("위치 기능을 지원하지 않는 기기입니다.");
        return;

    }


    navigator.geolocation.getCurrentPosition(

        function(position) {

            const lat = position.coords.latitude;
            const lng = position.coords.longitude;


            map.setView(
                [lat, lng],
                16
            );


            // 기존 위치 마커 제거
            if(userMarker){
                map.removeLayer(userMarker);
            }


            userMarker = L.marker(
                [lat, lng]
            )
            .addTo(map)
            .bindPopup("📍 현재 위치")
            .openPopup();


        },


        function(){

            alert(
                "위치를 가져올 수 없습니다."
            );

        }

    );

}



// 장소 검색
function searchPlace(keyword) {


    alert(
        keyword + " 검색 준비중!"
    );


}



// 실행
initMap();
