/*jshint esversion:6*/

$(function () {
    const video = $("video")[0];

    var model;
    var cameraMode = "environment"; // or "user"
    var detectedStudents = {};
    var attentivenessData = [];
    var detectionCount = {};
    let frameCount = 0;  // For limiting detection frequency

    const startVideoStreamPromise = navigator.mediaDevices
        .getUserMedia({
            audio: false,
            video: {
                facingMode: cameraMode,
                width: { ideal: 640 },  // Set lower resolution for performance
                height: { ideal: 480 }
            }
        })
        .then(function (stream) {
            return new Promise(function (resolve) {
                video.srcObject = stream;
                video.onloadeddata = function () {
                    video.play();
                    resolve();
                };
            });
        });

    var publishable_key = "rf_w63pLw7mWuR1diiU3F7gL6gMvtR2";
    var toLoad = {
        model: "attentiveness-thesis",
        version: 2
    };

    const loadModelPromise = new Promise(function (resolve, reject) {
        roboflow
            .auth({
                publishable_key: publishable_key
            })
            .load(toLoad)
            .then(function (m) {
                model = m;
                resolve();
            });
    });

    Promise.all([startVideoStreamPromise, loadModelPromise]).then(function () {
        $("body").removeClass("loading");
        resizeCanvas();
        detectFrame();
    });

    var canvas, ctx;
    const font = "16px sans-serif";

    function videoDimensions(video) {
        var videoRatio = video.videoWidth / video.videoHeight;
        var width = video.offsetWidth,
            height = video.offsetHeight;
        var elementRatio = width / height;

        if (elementRatio > videoRatio) {
            width = height * videoRatio;
        } else {
            height = width / videoRatio;
        }

        return {
            width: width,
            height: height
        };
    }

    $(window).resize(function () {
        resizeCanvas();
    });

    const resizeCanvas = function () {
        $("canvas").remove();

        canvas = $("<canvas/>");
        ctx = canvas[0].getContext("2d");

        var dimensions = videoDimensions(video);

        canvas[0].width = video.videoWidth;
        canvas[0].height = video.videoHeight;

        canvas.css({
            position: "absolute",
            width: dimensions.width,
            height: dimensions.height,
            top: 0,
            left: 0,
        });

        $(".video-container").append(canvas);
    };

    const renderPredictions = function (predictions) {
        var dimensions = videoDimensions(video);
        var scaleX = canvas[0].width / video.videoWidth;
        var scaleY = canvas[0].height / video.videoHeight;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        let studentsDetected = 0;
        let phonesDetected = 0; // New counter for phones
        let attentiveCount = 0;

        const isAttentiveChecked = $("#attentive-checkbox").is(":checked");
        const isInattentiveChecked = $("#inattentive-checkbox").is(":checked");

        predictions.forEach(function (prediction) {
            if ((isAttentiveChecked && prediction.class === "attentive") || 
                (isInattentiveChecked && prediction.class === "unattentive")) {

                const x = prediction.bbox.x * scaleX;
                const y = prediction.bbox.y * scaleY;
                const width = prediction.bbox.width * scaleX;
                const height = prediction.bbox.height * scaleY;

                studentsDetected++;
                if (prediction.class === "attentive") {
                    attentiveCount++;
                }

                const imageSrc = captureStudentImage(video, prediction.bbox);
                const timestamp = new Date().toLocaleTimeString();
                detectedStudents[timestamp] = {
                    image: imageSrc,
                    status: prediction.class
                };

                updateThumbnailGrid();
                updateDetectionCount(prediction.class);

                ctx.strokeStyle = prediction.color;
                ctx.lineWidth = 2;
                ctx.strokeRect(
                    x - width / 2,
                    y - height / 2,
                    width,
                    height
                );

                ctx.fillStyle = prediction.color;
                const textWidth = ctx.measureText(prediction.class).width;
                ctx.fillRect(
                    x - width / 2,
                    y - height / 2 - 20,
                    textWidth + 8,
                    20
                );

                ctx.fillStyle = "white";
                ctx.font = font;
                ctx.fillText(prediction.class, x - width / 2, y - height / 2);
            }

            if (prediction.class === "phone") {
                phonesDetected++;
            }
        });

        $("#students-count").text(`Students within the frame: ${studentsDetected}`);
        const attentivenessPercentage = Math.round((attentiveCount / (studentsDetected || 1)) * 100);
        $("#attentiveness-percentage").text(`Attentiveness Percentage: ${attentivenessPercentage}% of students are attentive`);
        
        $("#phones-count").text(`Phones within the frame detected: ${phonesDetected}`);

        updateAttentivenessChart(attentivenessPercentage);
    };

    function captureStudentImage(video, bbox) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = bbox.width;
        tempCanvas.height = bbox.height;
        const tempCtx = tempCanvas.getContext('2d');

        const scaleX = canvas[0].width / video.videoWidth;
        const scaleY = canvas[0].height / video.videoHeight;

        const x = bbox.x * scaleX;
        const y = bbox.y * scaleY;

        tempCtx.drawImage(video, x - bbox.width / 2, y - bbox.height / 2, bbox.width, bbox.height, 0, 0, bbox.width, bbox.height);
        
        return tempCanvas.toDataURL();
    }

    function updateThumbnailGrid() {
        const thumbnailsContainer = $("#thumbnails");
        thumbnailsContainer.empty();
        
        Object.keys(detectedStudents).forEach(timestamp => {
            const studentData = detectedStudents[timestamp];
            const thumbnail = $(`<div class="thumbnail" title="${studentData.status} - ${timestamp}">
                <img src="${studentData.image}" alt="Detected Student"/>
            </div>`);

            thumbnail.click(() => {
                showImageModal(studentData.image, studentData.status, timestamp);
            });

            thumbnailsContainer.append(thumbnail);
        });
    }

    function showImageModal(imageSrc, status, timestamp) {
        $("#modal-image").attr("src", imageSrc);
        $("#modal-info").text(`Status: ${status}, Time: ${timestamp}`);
        $("#image-modal").show();
    }

    $("#close-modal").click(() => {
        $("#image-modal").hide();
    });

    function updateDetectionCount(className) {
        detectionCount[className] = (detectionCount[className] || 0) + 1;

        let detectionText = "Detection Count: ";
        for (const [key, value] of Object.entries(detectionCount)) {
            detectionText += `${key}: ${value} `;
        }
        $("#detection-count").text(detectionText);
    }

    function updateAttentivenessChart(attentivenessPercentage) {
        attentivenessData.push(attentivenessPercentage);
        const ctx = document.getElementById('attentiveness-chart').getContext('2d');
        const chartData = {
            labels: Array.from({ length: attentivenessData.length }, (_, i) => i + 1),
            datasets: [{
                label: 'Attentiveness Percentage',
                data: attentivenessData,
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                fill: false,
            }]
        };

        if (Chart.getChart('attentiveness-chart')) {
            Chart.getChart('attentiveness-chart').data = chartData;
            Chart.getChart('attentiveness-chart').update();
        } else {
            new Chart(ctx, {
                type: 'line',
                data: chartData,
                options: {
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100
                        }
                    }
                }
            });
        }
    }

    function detectFrame() {
        if (frameCount % 5 === 0) {  // Run detection every 5 frames
            model.detect(video).then(function (predictions) {
                renderPredictions(predictions);
            }).catch(function (e) {
                console.log("Error during detection: ", e);
            });
        }
        frameCount++;
        requestAnimationFrame(detectFrame);
    }
});
