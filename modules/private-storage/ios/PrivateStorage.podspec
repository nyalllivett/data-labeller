Pod::Spec.new do |s|
  s.name = 'PrivateStorage'
  s.version = '0.1.0'
  s.summary = 'Prepare private persistent storage for Data Labeller'
  s.description = s.summary
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Data Labeller'
  s.homepage = 'https://github.com/nyalllivett/data-labeller'
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/nyalllivett/data-labeller.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
