import fs from "fs";
import path from "path";
import crypto from "crypto";
import { SPEnums } from "node-stream-processor";

import CameraClient from "../src/client";
import CameraSide from "../src/camera";
import { AllSettings } from "camera-interface";

const PORT = 8080;

describe("Initialization", () => {
  const settings: AllSettings = {
    camera: { width: 640, height: 480, format: SPEnums.Format.kRGB, quality: 75 },
    text: { font_path: "./test/font.tff", text_position: SPEnums.TextPosition.kBottom, font_size: 9, show_date: false },
    motion: { gaussian_size: 1, scale_denominator: 3, bg_stabil_length: 9, motion_stabil_length: 2, min_pixel_diff: 10, min_changed_pixels: 0.1, motion_fps_scale: 2 },
    device: { device_type: SPEnums.DeviceType.kSpecific, device_choice: 0 }
  };
  it("should fail if wrong password provided", (done) => {
    const camera = new CameraSide(PORT, path.join(__dirname, "..", "..", "test-files", "test_hash.json"), settings);
    const client = new CameraClient(path.join(__dirname, "..", "..", "test-files", "test_config_wrong.json"));

    camera.events.on("ready", () => {
      camera.Stop();
      client.Stop();
      done(false);
    });

    setTimeout(() => {
      camera.Stop();
      client.Stop();
      done();
    }, 1000);
  });

  it("should be successful if correct password is provided", (done) => {
    const camera = new CameraSide(PORT, path.join(__dirname, "..", "..", "test-files", "test_hash.json"), settings);
    const client = new CameraClient(path.join(__dirname, "..", "..", "test-files", "test_config.json"));

    camera.events.on("ready", () => {
      camera.Stop();
      client.Stop();
      done();
    });
  });

  it("should send camera settings once authenticated", (done) => {
    const camera = new CameraSide(PORT, path.join(__dirname, "..", "..", "test-files", "test_hash.json"), settings);
    const client = new CameraClient(path.join(__dirname, "..", "..", "test-files", "test_config.json"));

    client.events.on("ready", (set) => {
      camera.Stop();
      client.Stop();
      JSON.stringify(set).should.equal(JSON.stringify(settings));
      done();
    });
  });
});

describe("Send Messages", () => {
  const settings: AllSettings = {
    camera: { width: 640, height: 480, format: SPEnums.Format.kRGB, quality: 75 },
    text: { font_path: "./test/font.tff", text_position: SPEnums.TextPosition.kBottom, font_size: 9, show_date: false },
    motion: { gaussian_size: 1, scale_denominator: 3, bg_stabil_length: 9, motion_stabil_length: 2, min_pixel_diff: 10, min_changed_pixels: 0.1, motion_fps_scale: 2 },
    device: { device_type: SPEnums.DeviceType.kSpecific, device_choice: 0 }
  };

  it("should successfully send frame", (done) => {
    const camera = new CameraSide(PORT, path.join(__dirname, "..", "..", "test-files", "test_hash.json"), settings);
    const client = new CameraClient(path.join(__dirname, "..", "..", "test-files", "test_config.json"));

    const frame = crypto.randomBytes(100);
    const timestamp = Date.now();
    camera.events.on("ready", () => {
      camera.QueueFrame(frame, timestamp, false);
    });

    client.events.on("frame", (f, ts, m) => {
      client.Stop();
      camera.Stop();
      Buffer.compare(f, frame).should.equal(0);
      ts.should.equal(timestamp);
      m.should.be.false;
      done();
    });
  });

  it("should emit new settings event when receving new settings", (done) => {
    const camera = new CameraSide(PORT, path.join(__dirname, "..", "..", "test-files", "test_hash.json"), settings);
    const client = new CameraClient(path.join(__dirname, "..", "..", "test-files", "test_config.json"));

    const new_settings: AllSettings = {
      camera: { width: 320, height: 240, format: SPEnums.Format.kGray, quality: 50 },
      text: { font_path: "./test/other/font.tff", text_position: SPEnums.TextPosition.kTop, font_size: 18, show_date: true },
      motion: { gaussian_size: 3, scale_denominator: 2, bg_stabil_length: 13, motion_stabil_length: 1, min_pixel_diff: 5, min_changed_pixels: 0.11, motion_fps_scale: 3 },
      device: { device_type: SPEnums.DeviceType.kGPU, device_choice: 1 }
    };

    camera.events.on("ready", () => {
      client.SetCombinedSettings(new_settings);
    });

    camera.events.on("settings", (set) => {
      camera.Stop();
      client.Stop();
      JSON.stringify(set).should.equal(JSON.stringify(new_settings));
      done();
    });
  });
});

describe("Set new password", () => {
  const settings: AllSettings = {
    camera: { width: 640, height: 480, format: SPEnums.Format.kRGB, quality: 75 },
    text: { font_path: "./test/font.tff", text_position: SPEnums.TextPosition.kBottom, font_size: 9, show_date: false },
    motion: { gaussian_size: 1, scale_denominator: 3, bg_stabil_length: 9, motion_stabil_length: 2, min_pixel_diff: 10, min_changed_pixels: 0.1, motion_fps_scale: 2 },
    device: { device_type: SPEnums.DeviceType.kSpecific, device_choice: 0 }
  };

  it("should set new password and reconnect", (done) => {
    fs.writeFileSync(path.join(__dirname, "..", "..", "test-files", "test_hash_change.json"), JSON.stringify({ hash: "$argon2id$v=19$m=65536,t=3,p=4$/7+feZK/lNVObCYiJhOuJQ$iQVbinmaMc9OWdeg8FEDJ/ueGFj8d6PtBMb+y0kl9h0" }));
    fs.writeFileSync(path.join(__dirname, "..", "..", "test-files", "test_config_change.json"), JSON.stringify({ address: "ws://localhost:8080", pwd: "password" }));

    const camera = new CameraSide(PORT, path.join(__dirname, "..", "..", "test-files", "test_hash_change.json"), settings);
    const client = new CameraClient(path.join(__dirname, "..", "..", "test-files", "test_config_change.json"));

    camera.events.once("ready", () => {
      client.SetPassword("New Password");

      camera.events.once("ready", () => {
        camera.Stop();
        client.Stop();

        const new_hash = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "test-files", "test_hash_change.json")).toString()).hash;
        const new_password = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "test-files", "test_config_change.json")).toString()).pwd;

        new_hash.should.not.equal("$argon2id$v=19$m=65536,t=3,p=4$/7+feZK/lNVObCYiJhOuJQ$iQVbinmaMc9OWdeg8FEDJ/ueGFj8d6PtBMb+y0kl9h0");
        new_password.should.not.equal("password");


        done();
      });
    });
  }).timeout(10000);
});