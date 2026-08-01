// =============================
// 놀맵 V2
// script.js
// =============================

let currentLocation = null;

// -----------------------------
// 앱 시작
// -----------------------------

window.addEventListener("load", () => {

    initLocation();

    initButtons();

});

// -----------------------------
// 버튼 이벤트
// -----------------------------

function initButtons(){

    const locationBtn = document.getElementById("locationBtn");

    if(locationBtn){

        locationBtn.addEventListener("click", moveToCurrentLocation);

    }

    const searchBtn = document.getElementById("searchBtn");

    if(searchBtn){

        searchBtn.addEventListener("click", searchPlace);

    }

    document
        .querySelectorAll(".navItem")
        .forEach(button=>{

            button.addEventListener("click",()=>{

                document
                    .querySelectorAll(".navItem")
                    .forEach(b=>b.classList.remove("active"));

                button.classList.add("active");

            });

        });

}

// -----------------------------
// 현재 위치
// -----------------------------

function initLocation(){

    if(!navigator.geolocation){

        alert("현재 위치를 사용할 수 없습니다.");

        return;

    }

    navigator.geolocation.getCurrentPosition(

        (position)=>{

            currentLocation={

                lat:position.coords.latitude,

                lng:position.coords.longitude

            };

            if(typeof showCurrentLocation==="function"){

                showCurrentLocation(currentLocation);

            }

        },

        ()=>{

            alert("위치 권한을 허용해주세요.");

        },

        {

            enableHighAccuracy:true,

            timeout:10000

        }

    );

}

// -----------------------------
// 현재 위치 이동
// -----------------------------

function moveToCurrentLocation(){

    if(!currentLocation){

        alert("현재 위치를 찾는 중입니다.");

        return;

    }

    if(typeof moveMap==="function"){

        moveMap(currentLocation);

    }

}

// -----------------------------
// 검색
// -----------------------------

function searchPlace(){

    const keyword=document
        .getElementById("searchInput")
        .value
        .trim();

    if(keyword===""){

        alert("검색어를 입력하세요.");

        return;

    }

    if(typeof searchLocation==="function"){

        searchLocation(keyword);

    }

}

// -----------------------------
// 공통 팝업
// -----------------------------

function showMessage(message){

    alert(message);

}
