import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.drinkgoodenergy.scan"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.drinkgoodenergy.scan"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signed with the debug key so the APK installs on any emulator as is.
            // Swap in your own signing config for a store release.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // The UI lives in ../web and ships inside the APK as assets.
    sourceSets {
        getByName("main") {
            assets.srcDirs("../web")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    // Solana Mobile Wallet Adapter client. 2.1.1 is the latest release that builds on
    // stable Android Gradle Plugin 8.x (2.2.0 needs AGP 9.1 and API 37).
    implementation("com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.1.1") {
        // Its POM lists test libraries as regular dependencies. Keep them out of the app.
        exclude(group = "androidx.test")
        exclude(group = "androidx.test.ext")
        exclude(group = "junit")
    }

    implementation("androidx.activity:activity-ktx:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    testImplementation("junit:junit:4.13.2")
}
